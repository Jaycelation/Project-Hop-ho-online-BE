const express = require("express");
const router = express.Router();
const moderationController = require("../controllers/moderationController");
const { verifyToken } = require("../middlewares/authMiddleware");

// Đăng bài viết mới (Mặc định sẽ vào trạng thái 'pending')
router.post("/", verifyToken, moderationController.createPost);

// Lấy danh sách bài viết đã duyệt ('approved') để hiển thị trên Home
router.get("/", verifyToken, moderationController.listPosts);

module.exports = router;