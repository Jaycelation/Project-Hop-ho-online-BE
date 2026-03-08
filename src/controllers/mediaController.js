const Media = require("../models/MediaModel");
const Branch = require("../models/BranchModel");
const path = require("path");
const fs = require("fs");
const { success, error } = require("../utils/responseHandler");
const logAudit = require("../utils/auditLogger");
const securityGuard = require("../utils/securityGuard");
const { getAccessibleBranchIds } = require("../middlewares/authMiddleware");
const { hasBranchRole } = require("../utils/branchAccess");
const { createMediaAccessToken, verifyMediaAccessToken } = require("../utils/securityConfig");

const STORAGE_ROOT = path.resolve(__dirname, "../../storage");

function resolveStoragePath(storagePath) {
    if (!storagePath) return null;

    const absolutePath = path.isAbsolute(storagePath)
        ? path.resolve(storagePath)
        : path.resolve(__dirname, "../../", storagePath);

    if (absolutePath !== STORAGE_ROOT && !absolutePath.startsWith(`${STORAGE_ROOT}${path.sep}`)) {
        return null;
    }

    return absolutePath;
}

function buildSignedStreamUrl(req, media) {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const accessToken = createMediaAccessToken({
        mediaId: media._id,
        userId: req.user?._id || req.user?.id,
        branchId: media.branchId,
    });

    return `${baseUrl}/api/media/stream/${media._id}?accessToken=${encodeURIComponent(accessToken)}`;
}

const formatMediaResponse = (req, m) => {
    const safeStoragePath = resolveStoragePath(m.storagePath);
    const fileName = safeStoragePath ? path.basename(safeStoragePath) : null;
    const url = buildSignedStreamUrl(req, m);

    const obj = m.toObject();
    return {
        ...obj,
        id: obj._id,
        url,
        streamUrl: url,
        fileName,
        type: obj.kind,
        title: obj.caption || obj.originalName,
    };
};

async function canReadMediaWithUser(media, user) {
    if (!user) return false;
    if (!media?.branchId) return false;

    const branch = await Branch.findById(media.branchId);
    if (!branch || !hasBranchRole(branch, user, "viewer")) {
        return false;
    }

    return securityGuard.checkPrivacy(media, user);
}

exports.listMedia = async (req, res, next) => {
    try {
        const { branchId, personId, eventId, kind } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        const accessibleBranchIds = await getAccessibleBranchIds(req.user, "viewer");
        if (!accessibleBranchIds.length) {
            return success(res, [], { page, limit, total: 0, totalBeforeFilter: 0, totalPages: 0 });
        }

        const query = { branchId: { $in: accessibleBranchIds } };
        if (branchId) {
            if (!accessibleBranchIds.includes(branchId)) {
                return error(res, { code: "FORBIDDEN_BRANCH_ACCESS", message: "Access denied to this branch" }, 403);
            }
            query.branchId = branchId;
        }
        if (personId) query.personId = personId;
        if (eventId) query.eventId = eventId;
        if (kind) query.kind = kind;

        const media = await Media.find(query)
            .skip((page - 1) * limit)
            .limit(limit)
            .sort({ createdAt: -1 });

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

        const isUploader = originalMedia.uploadedBy && originalMedia.uploadedBy.toString() === req.user.id;
        const isAdmin = req.user.role === "admin";

        let isBranchEditorOrOwner = false;
        if (originalMedia.branchId) {
            const branch = await Branch.findById(originalMedia.branchId);
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

        const isUploader = media.uploadedBy && media.uploadedBy.toString() === req.user.id;
        const isAdmin = req.user.role === "admin";

        let isBranchEditorOrOwner = false;
        if (media.branchId) {
            const branch = await Branch.findById(media.branchId);
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

        const safeStoragePath = resolveStoragePath(media.storagePath);
        if (safeStoragePath && fs.existsSync(safeStoragePath)) {
            fs.unlinkSync(safeStoragePath);
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

        const accessToken = req.query.accessToken;
        if (accessToken) {
            try {
                verifyMediaAccessToken(accessToken, media._id.toString());
            } catch (tokenError) {
                return error(res, { code: "AUTH_INVALID_MEDIA_TOKEN", message: tokenError.message || "Invalid media access token" }, 401);
            }
        } else {
            if (!req.user) {
                return error(res, { code: "AUTH_MISSING_TOKEN", message: "No token provided" }, 401);
            }

            const hasAccess = await canReadMediaWithUser(media, req.user);
            if (!hasAccess) {
                return error(res, { code: "FORBIDDEN_PRIVATE_RESOURCE", message: "You do not have access to this media" }, 403);
            }
        }

        const filePath = resolveStoragePath(media.storagePath);
        if (!filePath) {
            return error(res, { code: "INVALID_STORAGE_PATH", message: "Invalid file storage path" }, 400);
        }

        if (!fs.existsSync(filePath)) {
            return error(res, { code: "FILE_NOT_FOUND", message: "File missing on server" }, 404);
        }

        const stat = fs.statSync(filePath);
        const fileSize = stat.size;

        res.setHeader("Content-Type", media.mimeType);
        res.setHeader("Cache-Control", "private, max-age=60");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(media.originalName)}"`);

        if (media.kind === "video" && req.headers.range) {
            const range = req.headers.range;
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = end - start + 1;

            const stream = fs.createReadStream(filePath, { start, end });

            res.writeHead(206, {
                "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                "Content-Length": chunkSize,
                "Content-Type": media.mimeType,
            });

            stream.pipe(res);
        } else {
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
