const Post = require("../models/PostModel");
const Media = require("../models/MediaModel");
const Branch = require("../models/BranchModel");
const { success, error } = require("../utils/responseHandler");
const logAudit = require("../utils/auditLogger");
const { hasBranchRole, getAccessibleBranchIds } = require("../utils/branchAccess");

async function getEditableBranchIds(user) {
    return getAccessibleBranchIds(user, "editor");
}

exports.getPending = async (req, res) => {
    try {
        const editableBranchIds = await getEditableBranchIds(req.user);

        const branchIds = req.query.branchId
            ? [req.query.branchId]
            : editableBranchIds;

        if (req.query.branchId && !editableBranchIds.includes(req.query.branchId)) {
            return error(res, { code: "FORBIDDEN_BRANCH_ACCESS", message: "Access denied to this branch" }, 403);
        }

        if (!branchIds.length) {
            return success(res, []);
        }

        const pendingPosts = await Post.find({
            branchId: { $in: branchIds },
            status: "pending"
        })
            .populate("user_id", "fullName email")
            .populate("branchId", "name")
            .sort({ createdAt: -1 })
            .lean();

        const pendingMedia = await Media.find({
            branchId: { $in: branchIds },
            status: "pending"
        })
            .populate("uploadedBy", "fullName email")
            .populate("branchId", "name")
            .sort({ createdAt: -1 })
            .lean();

        const items = [
            ...pendingPosts.map((p) => ({
                _id: p._id,
                entityType: "Post",
                content: p.content,
                status: p.status,
                author: p.user_id,
                branch: p.branchId,
                createdAt: p.createdAt,
            })),
            ...pendingMedia.map((m) => ({
                _id: m._id,
                entityType: "Media",
                content: m.caption || m.originalName,
                status: m.status || "pending",
                author: m.uploadedBy,
                branch: m.branchId,
                createdAt: m.createdAt,
                mediaKind: m.kind,
            })),
        ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return success(res, items);
    } catch (err) {
        return error(res, err);
    }
};

exports.updateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, entityType } = req.body;

        if (!["approved", "rejected"].includes(status)) {
            return error(res, { code: "INVALID_STATUS", message: "Status must be 'approved' or 'rejected'" }, 422);
        }

        const type = entityType === "Media" ? "Media" : "Post";
        const Model = type === "Media" ? Media : Post;
        const doc = await Model.findById(id);

        if (!doc) {
            return error(res, { code: "NOT_FOUND", message: `${type} not found` }, 404);
        }

        const branch = await Branch.findById(doc.branchId);
        if (!branch || !hasBranchRole(branch, req.user, "editor")) {
            return error(res, { code: "FORBIDDEN_BRANCH_ACCESS", message: `Access denied to this ${type.toLowerCase()}` }, 403);
        }

        doc.status = status;
        await doc.save();

        await logAudit({
            actorId: req.user.id,
            action: "MODERATION_UPDATE",
            entityType: type,
            entityId: doc._id,
            branchId: doc.branchId,
            after: { status }
        }, req);

        return success(res, { _id: doc._id, status: doc.status });
    } catch (err) {
        return error(res, err);
    }
};

exports.createPost = async (req, res) => {
    try {
        const { branchId, content } = req.body;

        if (!content || !content.trim()) {
            return error(res, { code: "MISSING_CONTENT", message: "Post content is required" }, 422);
        }

        const post = await Post.create({
            branchId,
            user_id: req.user.id,
            content: content.trim(),
            status: "pending"
        });

        await logAudit({
            actorId: req.user.id,
            action: "CREATE",
            entityType: "Post",
            entityId: post._id,
            branchId: post.branchId,
            after: post
        }, req);

        return success(res, post, null, 201);
    } catch (err) {
        return error(res, err);
    }
};

exports.listPosts = async (req, res) => {
    try {
        const { branchId } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        const visibleBranchIds = await getAccessibleBranchIds(req.user, "viewer");
        if (!visibleBranchIds.length) {
            return success(res, [], { page, limit, total: 0, totalPages: 0 });
        }

        const query = { status: "approved", branchId: { $in: visibleBranchIds } };
        if (branchId) {
            if (!visibleBranchIds.includes(branchId)) {
                return error(res, { code: "FORBIDDEN_BRANCH_ACCESS", message: "Access denied to this branch" }, 403);
            }
            query.branchId = branchId;
        }

        const posts = await Post.find(query)
            .populate("user_id", "fullName avatarUrl")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        const total = await Post.countDocuments(query);

        return success(res, posts, { page, limit, total, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        return error(res, err);
    }
};
