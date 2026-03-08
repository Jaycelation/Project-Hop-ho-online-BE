const express = require("express");
const router = express.Router();
const moderationController = require("../controllers/moderationController");
const { verifyToken, authorizeBranchAccess } = require("../middlewares/authMiddleware");

router.get("/pending", verifyToken, authorizeBranchAccess("editor", { paths: ["query.branchId"], optional: true }), moderationController.getPending);
router.put("/:id", verifyToken, moderationController.updateStatus);

module.exports = router;
