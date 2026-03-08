const Post = require("../models/PostModel");
const Comment = require("../models/CommentModel");
const Branch = require("../models/BranchModel");
const { success, error } = require("../utils/responseHandler");
const logAudit = require("../utils/auditLogger");
const { getAccessibleBranchIds } = require("../middlewares/authMiddleware");
const { hasBranchRole } = require("../utils/branchAccess");

async function getPostWithBranch(postId) {
    const post = await Post.findById(postId);
    if (!post) return { post: null, branch: null };

    const branch = post.branchId ? await Branch.findById(post.branchId) : null;
    return { post, branch };
}

function canManagePost(user, post, branch) {
    if (!user || !post) return false;
    if (user.role === "admin") return true;
    if (post.user_id && post.user_id.toString() === String(user.id || user._id)) return true;
    return !!(branch && hasBranchRole(branch, user, "editor"));
}

function canSeePostContent(user, post, branch) {
    if (!post) return false;
    if (post.status === "approved") {
        return !!(branch && hasBranchRole(branch, user, "viewer"));
    }
    return canManagePost(user, post, branch);
}

async function getCommentContext(commentId) {
    const comment = await Comment.findById(commentId);
    if (!comment) return { comment: null, post: null, branch: null };

    const { post, branch } = await getPostWithBranch(comment.post_id);
    return { comment, post, branch };
}

// --- POSTS API ---

exports.getPosts = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const accessibleBranchIds = await getAccessibleBranchIds(req.user, "viewer");
        if (!accessibleBranchIds.length) {
            return success(res, [], {
                count: 0,
                total: 0,
                totalPages: 0,
                currentPage: page,
            });
        }

        const query = { branchId: { $in: accessibleBranchIds }, status: "approved" };
        if (req.query.branchId) {
            if (!accessibleBranchIds.includes(req.query.branchId)) {
                return error(res, { code: "FORBIDDEN_BRANCH_ACCESS", message: "Access denied to this branch" }, 403);
            }
            query.branchId = req.query.branchId;
        }

        const posts = await Post.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("user_id", "fullName avatarUrl _id")
            .populate("likes", "_id fullName")
            .lean();

        const postsWithCommentsCount = await Promise.all(
            posts.map(async (post) => {
                const commentCount = await Comment.countDocuments({ post_id: post._id });
                return { ...post, commentCount };
            })
        );

        const total = await Post.countDocuments(query);

        return success(res, postsWithCommentsCount, {
            count: posts.length,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
        });
    } catch (err) {
        next(err);
    }
};

exports.createPost = async (req, res, next) => {
    try {
        const { branchId, content, feeling } = req.body;
        const image_url = req.body.image_url || req.body.imageUrl || req.body.image || "";
        const user_id = req.user.id;

        const newPost = await Post.create({
            branchId,
            user_id,
            content,
            image_url,
            feeling,
            likes: [],
            status: "pending",
        });

        await logAudit({
            actorId: user_id,
            action: "CREATE",
            entityType: "Post",
            entityId: newPost._id,
            branchId: newPost.branchId,
            after: newPost,
        }, req);

        await newPost.populate("user_id", "fullName avatarUrl _id");

        return success(res, newPost, null, 201);
    } catch (err) {
        next(err);
    }
};

exports.updatePost = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { content, feeling } = req.body;
        const incomingImageUrl = req.body.image_url || req.body.imageUrl || req.body.image;

        const { post, branch } = await getPostWithBranch(id);
        if (!post) {
            return error(res, { code: "POST_NOT_FOUND", message: "Post not found" }, 404);
        }

        if (!canManagePost(req.user, post, branch)) {
            return error(res, { code: "FORBIDDEN", message: "Not authorized to update this post" }, 403);
        }

        post.content = content || post.content;
        post.image_url = incomingImageUrl !== undefined ? incomingImageUrl : post.image_url;
        post.feeling = feeling !== undefined ? feeling : post.feeling;
        if (req.user.role !== "admin" && (!branch || !hasBranchRole(branch, req.user, "editor"))) {
            post.status = "pending";
        }

        const updatedPost = await post.save();
        await updatedPost.populate("user_id", "fullName avatarUrl _id");
        await updatedPost.populate("likes", "_id fullName");

        return success(res, updatedPost);
    } catch (err) {
        next(err);
    }
};

exports.deletePost = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { post, branch } = await getPostWithBranch(id);

        if (!post) {
            return error(res, { code: "POST_NOT_FOUND", message: "Post not found" }, 404);
        }

        if (!canManagePost(req.user, post, branch)) {
            return error(res, { code: "FORBIDDEN", message: "Not authorized to delete this post" }, 403);
        }

        await logAudit({
            actorId: req.user.id,
            action: "DELETE",
            entityType: "Post",
            entityId: id,
            branchId: post.branchId,
            before: post,
        }, req);

        await Post.findByIdAndDelete(id);
        await Comment.deleteMany({ post_id: id });

        return success(res, { message: "Post deleted successfully" });
    } catch (err) {
        next(err);
    }
};

// --- INTERACTIONS API ---

exports.toggleLikePost = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { post, branch } = await getPostWithBranch(id);

        if (!post) {
            return error(res, { code: "POST_NOT_FOUND", message: "Post not found" }, 404);
        }

        if (!canSeePostContent(req.user, post, branch)) {
            return error(res, { code: "FORBIDDEN", message: "Not authorized to interact with this post" }, 403);
        }

        const userId = String(req.user.id);
        const isLiked = post.likes.some((likeId) => likeId.toString() === userId);

        if (isLiked) {
            post.likes = post.likes.filter((likeId) => likeId.toString() !== userId);
        } else {
            post.likes.push(req.user.id);
        }

        await post.save();
        await post.populate("likes", "_id fullName");

        return success(res, {
            message: isLiked ? "Unliked successfully" : "Liked successfully",
            likes: post.likes,
            likesCount: post.likes.length,
        });
    } catch (err) {
        next(err);
    }
};

exports.getComments = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { post, branch } = await getPostWithBranch(id);

        if (!post) {
            return error(res, { code: "POST_NOT_FOUND", message: "Post not found" }, 404);
        }

        if (!canSeePostContent(req.user, post, branch)) {
            return error(res, { code: "FORBIDDEN", message: "Not authorized to view comments for this post" }, 403);
        }

        const comments = await Comment.find({ post_id: id })
            .sort({ createdAt: 1 })
            .populate("user_id", "fullName avatarUrl _id");

        return success(res, comments, { count: comments.length });
    } catch (err) {
        next(err);
    }
};

exports.addComment = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { content } = req.body;
        const { post, branch } = await getPostWithBranch(id);

        if (!post) {
            return error(res, { code: "POST_NOT_FOUND", message: "Post not found" }, 404);
        }

        if (!canSeePostContent(req.user, post, branch)) {
            return error(res, { code: "FORBIDDEN", message: "Not authorized to comment on this post" }, 403);
        }

        const newComment = await Comment.create({
            post_id: id,
            user_id: req.user.id,
            content,
        });

        await newComment.populate("user_id", "fullName avatarUrl _id");

        return success(res, newComment, null, 201);
    } catch (err) {
        next(err);
    }
};

exports.updateComment = async (req, res, next) => {
    try {
        const { commentId } = req.params;
        const { content } = req.body;
        const { comment, post, branch } = await getCommentContext(commentId);

        if (!comment) {
            return error(res, { code: "COMMENT_NOT_FOUND", message: "Comment not found" }, 404);
        }

        const isAuthor = comment.user_id.toString() === String(req.user.id);
        if (!isAuthor && !canManagePost(req.user, post, branch)) {
            return error(res, { code: "FORBIDDEN", message: "Not authorized to update this comment" }, 403);
        }

        comment.content = content || comment.content;
        const updatedComment = await comment.save();
        await updatedComment.populate("user_id", "fullName avatarUrl _id");

        return success(res, updatedComment);
    } catch (err) {
        next(err);
    }
};

exports.deleteComment = async (req, res, next) => {
    try {
        const { commentId } = req.params;
        const { comment, post, branch } = await getCommentContext(commentId);

        if (!comment) {
            return error(res, { code: "COMMENT_NOT_FOUND", message: "Comment not found" }, 404);
        }

        const isAuthor = comment.user_id.toString() === String(req.user.id);
        if (!isAuthor && !canManagePost(req.user, post, branch)) {
            return error(res, { code: "FORBIDDEN", message: "Not authorized to delete this comment" }, 403);
        }

        await Comment.findByIdAndDelete(commentId);

        return success(res, { message: "Comment deleted successfully" });
    } catch (err) {
        next(err);
    }
};
