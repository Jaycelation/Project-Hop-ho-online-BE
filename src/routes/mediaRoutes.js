const express = require("express");
const router = express.Router();
const mediaController = require("../controllers/mediaController");
const { verifyToken, authorizeRoles } = require("../middlewares/authMiddleware");
const upload = require("../middlewares/uploadMiddleware");

// Upload
router.post("/upload", verifyToken, authorizeRoles("admin", "editor"), upload.single("file"), mediaController.uploadMedia);

// Meta Data
router.get("/:id", verifyToken, mediaController.getMedia);
router.put("/:id", verifyToken, authorizeRoles("admin", "editor"), mediaController.updateMedia);
router.delete("/:id", verifyToken, authorizeRoles("admin", "editor"), mediaController.deleteMedia);

// Stream
router.get("/stream/:id", verifyToken, mediaController.streamMedia);

module.exports = router;
