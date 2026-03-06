const express = require("express");
const router = express.Router();
const moderationController = require("../controllers/moderationController");
const { verifyToken } = require("../middlewares/authMiddleware");

// Lấy danh sách chờ duyệt (Post + Media)
router.get("/pending", verifyToken, moderationController.getPending);

// Phê duyệt hoặc từ chối
router.put("/:id", verifyToken, moderationController.updateStatus);

module.exports = router;