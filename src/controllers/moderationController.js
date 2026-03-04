const Post = require("../models/PostModel");
const Media = require("../models/MediaModel");
const Branch = require("../models/BranchModel");
const { success, error } = require("../utils/responseHandler");
const logAudit = require("../utils/auditLogger");

/**
 * Helper: find all branches where the user is owner or has editor role.
 */
async function getEditableBranchIds(userId, isGlobalAdmin) {
    let query;
    if (isGlobalAdmin) {
        // Admin sees all branches
        const branches = await Branch.find({}).select("_id").lean();
        return branches.map((b) => b._id.toString());
    }
    const branches = await Branch.find({
        $or: [
            { ownerId: userId },
            { members: { $elemMatch: { userId, roleInBranch: { $in: ["owner", "editor"] } } } }
        ]
    }).select("_id").lean();
    return branches.map((b) => b._id.toString());
}

// ─── GET /api/moderation/pending ──────────────────────────────────────────────
// Returns all pending Posts and Media in branches where the caller has editor+ role.
// Optionally filter by ?branchId=...
exports.getPending = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const isGlobalAdmin = req.user.role === "admin";

        let branchIds;
        if (req.query.branchId) {
            // Scoped to a specific branch — authorizeBranchAccess("editor") on the route ensures access
            branchIds = [req.query.branchId];
        } else {
            branchIds = await getEditableBranchIds(userId, isGlobalAdmin);
        }

        if (!branchIds.length) {
            return success(res, []);
        }

        // Fetch pending Posts
        const pendingPosts = await Post.find({
            branchId: { $in: branchIds },
            status: "pending"
        })
            .populate("authorId", "fullName email")
            .populate("branchId", "name")
            .sort({ createdAt: -1 })
            .lean();

        // Fetch pending Media uploads
        const pendingMedia = await Media.find({
            branchId: { $in: branchIds },
            status: "pending"
        })
            .populate("uploadedBy", "fullName email")
            .populate("branchId", "name")
            .sort({ createdAt: -1 })
            .lean();

        // Normalize into a unified list
        const items = [
            ...pendingPosts.map((p) => ({
                _id: p._id,
                entityType: "Post",
                content: p.content,
                status: p.status,
                author: p.authorId,
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

// ─── PUT /api/moderation/:id?entityType=Post|Media ────────────────────────────
// Updates status of a pending Post or Media item to "approved" or "rejected".
exports.updateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, entityType } = req.body;

        if (!["approved", "rejected"].includes(status)) {
            return error(res, { code: "INVALID_STATUS", message: "Status must be 'approved' or 'rejected'" }, 422);
        }

        const type = entityType || "Post";
        let doc;

        if (type === "Media") {
            doc = await Media.findById(id);
            if (!doc) return error(res, { code: "NOT_FOUND", message: "Media not found" }, 404);
            doc.status = status;
            await doc.save();
        } else {
            doc = await Post.findById(id);
            if (!doc) return error(res, { code: "NOT_FOUND", message: "Post not found" }, 404);
            doc.status = status;
            await doc.save();
        }

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

// ─── POST /api/posts ───────────────────────────────────────────────────────────
// Create a new Post (status defaults to "pending")
exports.createPost = async (req, res) => {
    try {
        const { branchId, content } = req.body;

        if (!content || !content.trim()) {
            return error(res, { code: "MISSING_CONTENT", message: "Post content is required" }, 422);
        }

        const post = await Post.create({
            branchId,
            authorId: req.user.id,
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

// ─── GET /api/posts ────────────────────────────────────────────────────────────
// List approved posts for a branch (visible to branch members)
exports.listPosts = async (req, res) => {
    try {
        const { branchId } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        let query = { status: "approved" };
        if (branchId) query.branchId = branchId;

        const posts = await Post.find(query)
            .populate("authorId", "fullName avatarUrl")
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
