const express = require("express");
const { verifyToken } = require("../middlewares/authMiddleware");
const postController = require("../controllers/postController");
const validate = require("../middlewares/validate");
const { createPostSchema, updatePostSchema, commentSchema } = require("../validators/postValidator");

const router = express.Router();

router.use(verifyToken);

// Quản lý Bài viết (Posts API)
router.route("/")
    .get(postController.getPosts)
    .post(validate(createPostSchema), postController.createPost);

router.route("/:id")
    .put(validate(updatePostSchema), postController.updatePost)
    .delete(postController.deletePost);

// Tương tác (Likes & Comments)
router.route("/:id/like")
    .post(postController.toggleLikePost);

router.route("/:id/comments")
    .get(postController.getComments)
    .post(validate(commentSchema), postController.addComment);

router.route("/comments/:commentId")
    .put(validate(commentSchema), postController.updateComment)
    .delete(postController.deleteComment);

module.exports = router;