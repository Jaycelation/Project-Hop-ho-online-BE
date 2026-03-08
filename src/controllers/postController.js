const Post = require("../models/PostModel");
const Comment = require("../models/CommentModel");
const { success, error } = require("../utils/responseHandler");
const logAudit = require("../utils/auditLogger");

// --- POSTS API ---

// Lấy danh sách bài viết trên New Feed
exports.getPosts = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const posts = await Post.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("user_id", "fullName avatarUrl _id")
            .populate("likes", "_id fullName")
            .lean(); // Fetch plain objects to attach arbitrary property

        // Async loop to find comment count for each post
        const postsWithCommentsCount = await Promise.all(
            posts.map(async (post) => {
                const commentCount = await Comment.countDocuments({ post_id: post._id });
                return { ...post, commentCount };
            })
        );

        const total = await Post.countDocuments();

        return success(res, postsWithCommentsCount, {
            count: posts.length,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: page
        });
    } catch (error) {
        next(error);
    }
};

// Tạo bài viết mới
exports.createPost = async (req, res, next) => {
    try {
        const { content, feeling } = req.body;
        // Hỗ trợ nhiều cách đặt tên field ảnh từ frontend
        const image_url = req.body.image_url || req.body.imageUrl || req.body.image || "";
        const user_id = req.user.id; // Lấy từ auth middleware


        const newPost = await Post.create({
            user_id,
            content,
            image_url,
            feeling,
            likes: [],
        });

        await logAudit({
            actorId: user_id,
            action: "CREATE",
            entityType: "Post",
            entityId: newPost._id,
            after: newPost
        }, req);


        // Populate user info so the frontend can render immediately
        await newPost.populate("user_id", "fullName avatarUrl _id");

        return success(res, newPost, null, 201);
    } catch (error) {
        next(error);
    }
};

// Sửa bài viết
exports.updatePost = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { content, feeling } = req.body;
        const incomingImageUrl = req.body.image_url || req.body.imageUrl || req.body.image;
        const user_id = req.user.id;

        const post = await Post.findById(id);

        if (!post) {
            return error(res, { code: "POST_NOT_FOUND", message: "Post not found" }, 404);
        }

        // Kiểm tra quyền (chỉ người tạo mới được sửa)
        if (post.user_id.toString() !== user_id) {
            return error(res, { code: "FORBIDDEN", message: "Not authorized to update this post" }, 403);
        }

        post.content = content || post.content;
        post.image_url = incomingImageUrl !== undefined ? incomingImageUrl : post.image_url;
        post.feeling = feeling !== undefined ? feeling : post.feeling;

        const updatedPost = await post.save();
        await updatedPost.populate("user_id", "fullName avatarUrl _id");
        await updatedPost.populate("likes", "_id fullName");

        return success(res, updatedPost);
    } catch (error) {
        next(error);
    }
};

// Xóa bài viết
exports.deletePost = async (req, res, next) => {
    try {
        const { id } = req.params;
        const user_id = req.user.id;

        const post = await Post.findById(id);

        if (!post) {
            return error(res, { code: "POST_NOT_FOUND", message: "Post not found" }, 404);
        }

        // Kiểm tra quyền (chỉ người tạo mới được xóa, hoặc có thể thêm admin sau này)
        if (post.user_id.toString() !== user_id) {
            return error(res, { code: "FORBIDDEN", message: "Not authorized to delete this post" }, 403);
        }

        await logAudit({
            actorId: user_id,
            action: "DELETE",
            entityType: "Post",
            entityId: id,
            before: post
        }, req);

        await Post.findByIdAndDelete(id);

        // Xóa các comment liên quan
        await Comment.deleteMany({ post_id: id });


        return success(res, { message: "Post deleted successfully" });
    } catch (error) {
        next(error);
    }
};


// --- INTERACTIONS API ---

// Toggle Like / Unlike
exports.toggleLikePost = async (req, res, next) => {
    try {
        const { id } = req.params;
        const user_id = req.user.id;

        const post = await Post.findById(id);

        if (!post) {
            return error(res, { code: "POST_NOT_FOUND", message: "Post not found" }, 404);
        }

        const isLiked = post.likes.some(likeId => likeId.toString() === user_id.toString());

        if (isLiked) {
            // Đã like -> Xóa khỏi mảng (Unlike)
            post.likes = post.likes.filter(likeId => likeId.toString() !== user_id.toString());
        } else {
            // Chưa like -> Thêm vào mảng (Like)
            post.likes.push(user_id);
        }

        await post.save();
        await post.populate("likes", "_id fullName");

        return success(res, {
            message: isLiked ? "Unliked successfully" : "Liked successfully",
            likes: post.likes,
            likesCount: post.likes.length
        });
    } catch (error) {
        next(error);
    }
};

// Lấy toàn bộ bình luận của bài viết
exports.getComments = async (req, res, next) => {
    try {
        const { id } = req.params;

        const comments = await Comment.find({ post_id: id })
            .sort({ createdAt: 1 }) // Cũ nhất trước hoặc mới nhất trước tùy ý (-1)
            .populate("user_id", "fullName avatarUrl _id");

        return success(res, comments, { count: comments.length });
    } catch (error) {
        next(error);
    }
};

// Đăng bình luận mới
exports.addComment = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { content } = req.body;
        const user_id = req.user.id;

        const post = await Post.findById(id);
        if (!post) {
            return error(res, { code: "POST_NOT_FOUND", message: "Post not found" }, 404);
        }


        const newComment = await Comment.create({
            post_id: id,
            user_id,
            content,
        });

        // Populate để trả về full thông tin user
        await newComment.populate("user_id", "fullName avatarUrl _id");

        return success(res, newComment, null, 201);
    } catch (error) {
        next(error);
    }
};

// Sửa bình luận
exports.updateComment = async (req, res, next) => {
    try {
        const { commentId } = req.params;
        const { content } = req.body;
        const user_id = req.user.id;

        const comment = await Comment.findById(commentId);
        if (!comment) {
            return error(res, { code: "COMMENT_NOT_FOUND", message: "Comment not found" }, 404);
        }

        if (comment.user_id.toString() !== user_id) {
            return error(res, { code: "FORBIDDEN", message: "Not authorized to update this comment" }, 403);
        }

        comment.content = content || comment.content;
        const updatedComment = await comment.save();
        await updatedComment.populate("user_id", "fullName avatarUrl _id");

        return success(res, updatedComment);
    } catch (error) {
        next(error);
    }
};

// Xóa bình luận
exports.deleteComment = async (req, res, next) => {
    try {
        const { commentId } = req.params;
        const user_id = req.user.id;

        const comment = await Comment.findById(commentId);
        if (!comment) {
            return error(res, { code: "COMMENT_NOT_FOUND", message: "Comment not found" }, 404);
        }

        if (comment.user_id.toString() !== user_id) {
            return error(res, { code: "FORBIDDEN", message: "Not authorized to delete this comment" }, 403);
        }

        await Comment.findByIdAndDelete(commentId);

        return success(res, { message: "Comment deleted successfully" });
    } catch (error) {
        next(error);
    }
};
