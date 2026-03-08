const Media = require("../models/MediaModel");
const path = require("path");
const fs = require("fs");
const { success, error } = require("../utils/responseHandler");
const logAudit = require("../utils/auditLogger");
const securityGuard = require("../utils/securityGuard");

const formatMediaResponse = (req, m) => {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const fileName = path.basename(m.storagePath);
    const url = `${baseUrl}/storage/uploads/${fileName}`;

    const obj = m.toObject();
    return {
        ...obj,
        id: obj._id,
        url: url,
        type: obj.kind,
        title: obj.caption || obj.originalName
    };
};

exports.listMedia = async (req, res, next) => {
    try {
        const { branchId, personId, eventId, kind } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        const query = {};
        if (branchId) query.branchId = branchId;
        if (personId) query.personId = personId;
        if (eventId) query.eventId = eventId;
        if (kind) query.kind = kind;

        const media = await Media.find(query)
            .skip((page - 1) * limit)
            .limit(limit)
            .sort({ createdAt: -1 });

        // Filter by privacy
        const filtered = [];
        for (const m of media) {
            const hasAccess = await securityGuard.checkPrivacy(m, req.user);
            if (hasAccess) filtered.push(formatMediaResponse(req, m));
        }

        const totalBeforeFilter = await Media.countDocuments(query);
        const total = filtered.length;

        return success(res, filtered, {
            page,
            limit,
            total,
            totalBeforeFilter,
            totalPages: Math.ceil(totalBeforeFilter / limit)
        });
    } catch (err) {
        next(err);
    }
};

exports.uploadMedia = async (req, res, next) => {
    try {
        if (!req.file) {
            return error(res, { code: "NO_FILE", message: "No file uploaded" }, 400);
        }

        const { branchId, personId, eventId, privacy, caption } = req.body;

        const kind = req.file.mimetype.startsWith("video") ? "video" : "image";

        const media = await Media.create({
            branchId,
            personId: personId || null,
            eventId: eventId || null,
            kind,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            sizeBytes: req.file.size,
            storagePath: req.file.path,
            caption: caption || "",
            privacy: privacy || "internal",
            uploadedBy: req.user.id
        });

        await logAudit({
            actorId: req.user.id,
            action: "CREATE",
            entityType: "Media",
            entityId: media._id,
            branchId: media.branchId,
            after: media
        }, req);

        return success(res, formatMediaResponse(req, media), null, 201);
    } catch (err) {
        // Cleanup file if DB insert fails
        if (req.file) {
            fs.unlink(req.file.path, () => { });
        }
        next(err);
    }
};

exports.getMedia = async (req, res, next) => {
    try {
        const media = await Media.findById(req.params.id);
        if (!media) return error(res, { code: "NOT_FOUND", message: "Media not found" }, 404);

        const hasAccess = await securityGuard.checkPrivacy(media, req.user);
        if (!hasAccess) {
            return error(res, { code: "FORBIDDEN_PRIVATE_RESOURCE", message: "You do not have access to this media" }, 403);
        }

        return success(res, formatMediaResponse(req, media));
    } catch (err) {
        next(err);
    }
};

exports.updateMedia = async (req, res, next) => {
    try {
        const originalMedia = await Media.findById(req.params.id);
        if (!originalMedia) return error(res, { code: "NOT_FOUND", message: "Media not found" }, 404);

        // Write permission check
        const isUploader = originalMedia.uploadedBy && originalMedia.uploadedBy.toString() === req.user.id;
        const isAdmin = req.user.role === "admin";

        let isBranchEditorOrOwner = false;
        if (originalMedia.branchId) {
            const branch = await require("../models/BranchModel").findById(originalMedia.branchId);
            if (branch) {
                const member = branch.members.find(m => m.userId.toString() === req.user.id);
                if (branch.ownerId.toString() === req.user.id || (member && (member.roleInBranch === "editor" || member.roleInBranch === "owner"))) {
                    isBranchEditorOrOwner = true;
                }
            }
        }

        if (!isUploader && !isAdmin && !isBranchEditorOrOwner) {
            return error(res, { code: "FORBIDDEN_PRIVATE_RESOURCE", message: "You do not have access to modify this media" }, 403);
        }

        // Only allow safe fields to be updated
        const { caption, privacy, personId, eventId } = req.body;
        const updateFields = {};
        if (caption !== undefined) updateFields.caption = caption;
        if (privacy !== undefined) updateFields.privacy = privacy;
        if (personId !== undefined) updateFields.personId = personId;
        if (eventId !== undefined) updateFields.eventId = eventId;

        const media = await Media.findByIdAndUpdate(
            req.params.id,
            updateFields,
            { new: true, runValidators: true }
        );

        await logAudit({
            actorId: req.user.id,
            action: "UPDATE",
            entityType: "Media",
            entityId: media._id,
            branchId: media.branchId,
            before: originalMedia,
            after: media
        }, req);

        return success(res, formatMediaResponse(req, media));
    } catch (err) {
        next(err);
    }
};

exports.deleteMedia = async (req, res, next) => {
    try {
        const media = await Media.findById(req.params.id);
        if (!media) return error(res, { code: "NOT_FOUND", message: "Media not found" }, 404);

        // Write permission check
        const isUploader = media.uploadedBy && media.uploadedBy.toString() === req.user.id;
        const isAdmin = req.user.role === "admin";

        // Let's assume branch owner/editor can also delete media in their branch
        let isBranchEditorOrOwner = false;
        if (media.branchId) {
            const branch = await require("../models/BranchModel").findById(media.branchId);
            if (branch) {
                const member = branch.members.find(m => m.userId.toString() === req.user.id);
                if (branch.ownerId.toString() === req.user.id || (member && (member.roleInBranch === "editor" || member.roleInBranch === "owner"))) {
                    isBranchEditorOrOwner = true;
                }
            }
        }

        if (!isUploader && !isAdmin && !isBranchEditorOrOwner) {
            return error(res, { code: "FORBIDDEN_PRIVATE_RESOURCE", message: "You do not have access to delete this media" }, 403);
        }

        // Delete file from disk
        if (fs.existsSync(media.storagePath)) {
            fs.unlinkSync(media.storagePath);
        }

        await media.deleteOne();

        await logAudit({
            actorId: req.user.id,
            action: "DELETE",
            entityType: "Media",
            entityId: media._id,
            branchId: media.branchId,
            before: media
        }, req);

        return success(res, { message: "Media deleted" });
    } catch (err) {
        next(err);
    }
};

exports.streamMedia = async (req, res, next) => {
    try {
        const media = await Media.findById(req.params.id);
        if (!media) return error(res, { code: "NOT_FOUND", message: "Media not found" }, 404);

        // Privacy check
        const hasAccess = await securityGuard.checkPrivacy(media, req.user);
        if (!hasAccess) {
            return error(res, { code: "FORBIDDEN_PRIVATE_RESOURCE", message: "You do not have access to this media" }, 403);
        }

        const filePath = media.storagePath;
        if (!fs.existsSync(filePath)) {
            return error(res, { code: "FILE_NOT_FOUND", message: "File missing on server" }, 404);
        }

        const stat = fs.statSync(filePath);
        const fileSize = stat.size;

        // Range-based streaming for video
        if (media.kind === "video" && req.headers.range) {
            const range = req.headers.range;
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = end - start + 1;

            const stream = fs.createReadStream(filePath, { start, end });

            res.writeHead(206, {
                "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                "Accept-Ranges": "bytes",
                "Content-Length": chunkSize,
                "Content-Type": media.mimeType,
            });

            stream.pipe(res);
        } else {
            // Full file response (images or video without range)
            res.writeHead(200, {
                "Content-Length": fileSize,
                "Content-Type": media.mimeType,
            });
            fs.createReadStream(filePath).pipe(res);
        }
    } catch (err) {
        next(err);
    }
};
