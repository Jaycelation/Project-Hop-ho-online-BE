const express = require("express");
const router = express.Router();
const modController = require("../controllers/moderationController");
const { verifyToken, authorizeBranchAccess } = require("../middlewares/authMiddleware");

// ─── Posts (all authenticated members can create posts in their branch) ─────

// POST /api/posts  — create a new post (any branch member)
router.post(
    "/",
    verifyToken,
    authorizeBranchAccess("viewer"), // any branch member (viewer+) can create a post
    modController.createPost
);

// GET /api/posts?branchId=...  — list approved posts for a branch
router.get(
    "/",
    verifyToken,
    modController.listPosts
);

module.exports = router;
