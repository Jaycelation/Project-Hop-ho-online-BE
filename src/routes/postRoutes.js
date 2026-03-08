const express = require("express");
const Post = require("../models/PostModel");
const postController = require("../controllers/postController");
const validate = require("../middlewares/validate");
const {
    verifyToken,
    authorizeBranchAccess,
    authorizeResourceBranchAccess,
} = require("../middlewares/authMiddleware");
const { createPostSchema, updatePostSchema, commentSchema } = require("../validators/postValidator");

const router = express.Router();

router.use(verifyToken);

router.route("/")
    .get(authorizeBranchAccess("viewer", { paths: ["query.branchId"], optional: true }), postController.getPosts)
    .post(authorizeBranchAccess("viewer", { paths: ["body.branchId"] }), validate(createPostSchema), postController.createPost);

router.route("/:id")
    .put(authorizeResourceBranchAccess(Post, "viewer", { resourceName: "Post" }), validate(updatePostSchema), postController.updatePost)
    .delete(authorizeResourceBranchAccess(Post, "viewer", { resourceName: "Post" }), postController.deletePost);

router.route("/:id/like")
    .post(authorizeResourceBranchAccess(Post, "viewer", { resourceName: "Post" }), postController.toggleLikePost);

router.route("/:id/comments")
    .get(authorizeResourceBranchAccess(Post, "viewer", { resourceName: "Post" }), postController.getComments)
    .post(authorizeResourceBranchAccess(Post, "viewer", { resourceName: "Post" }), validate(commentSchema), postController.addComment);

router.route("/comments/:commentId")
    .put(validate(commentSchema), postController.updateComment)
    .delete(postController.deleteComment);

module.exports = router;
