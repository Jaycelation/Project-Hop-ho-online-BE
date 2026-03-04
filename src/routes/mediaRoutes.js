const express = require("express");
const router = express.Router();
const mediaController = require("../controllers/mediaController");
const { verifyToken, authorizeBranchAccess, authorizeRoles } = require("../middlewares/authMiddleware");
const upload = require("../middlewares/uploadMiddleware");
const validate = require("../middlewares/validate");
const { uploadMediaSchema, updateMediaSchema } = require("../validators/mediaValidator");

// ─── Upload Media (any branch member can upload; status defaults to pending) ──
// Note: multer parses the multipart body, so branchId appears in req.body after upload
// We do authorizeBranchAccess AFTER multer processes the form so branchId is available
router.post(
    "/upload",
    verifyToken,
    upload.single("file"),
    authorizeBranchAccess("viewer"), // any branch member (viewer+) can upload; goes to moderation
    validate(uploadMediaSchema),
    mediaController.uploadMedia
);

// ─── Get Media metadata (privacy check in controller) ─────────────────────────
router.get("/:id", verifyToken, mediaController.getMedia);

// ─── Update Media metadata (branch editor+) ────────────────────────────────────
router.put(
    "/:id",
    verifyToken,
    authorizeRoles("admin", "editor"),
    validate(updateMediaSchema),
    mediaController.updateMedia
);

// ─── Delete Media (branch editor+) ────────────────────────────────────────────
router.delete(
    "/:id",
    verifyToken,
    authorizeRoles("admin", "editor"),
    mediaController.deleteMedia
);

// ─── Stream (privacy check in controller) ─────────────────────────────────────
router.get("/stream/:id", verifyToken, mediaController.streamMedia);

module.exports = router;
