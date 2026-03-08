const express = require("express");
const router = express.Router();
const mediaController = require("../controllers/mediaController");
const Media = require("../models/MediaModel");
const { verifyToken, optionalVerifyToken, authorizeRoles, authorizeBranchAccess, authorizeResourceBranchAccess } = require("../middlewares/authMiddleware");
const upload = require("../middlewares/uploadMiddleware");
const validate = require("../middlewares/validate");
const { uploadMediaSchema, updateMediaSchema } = require("../validators/mediaValidator");

router.post("/upload", verifyToken, authorizeRoles("admin", "editor"), authorizeBranchAccess("editor", { paths: ["body.branchId"] }), upload.single("file"), validate(uploadMediaSchema), mediaController.uploadMedia);
router.get("/", verifyToken, authorizeBranchAccess("viewer", { paths: ["query.branchId"], optional: true }), mediaController.listMedia);
router.get("/stream/:id", optionalVerifyToken, mediaController.streamMedia);
router.get("/:id", verifyToken, authorizeResourceBranchAccess(Media, "viewer", { resourceName: "Media" }), mediaController.getMedia);
router.put("/:id", verifyToken, authorizeRoles("admin", "editor"), authorizeResourceBranchAccess(Media, "editor", { resourceName: "Media" }), validate(updateMediaSchema), mediaController.updateMedia);
router.delete("/:id", verifyToken, authorizeRoles("admin", "editor"), authorizeResourceBranchAccess(Media, "editor", { resourceName: "Media" }), mediaController.deleteMedia);

module.exports = router;
