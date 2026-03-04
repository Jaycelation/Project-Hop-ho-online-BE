const express = require("express");
const router = express.Router();
const modController = require("../controllers/moderationController");
const { verifyToken, authorizeRoles, authorizeBranchAccess } = require("../middlewares/authMiddleware");

// ─── Moderation (editor+ in branch, or global admin) ─────────────────────────

// GET /api/moderation/pending?branchId=...
// Returns all pending Posts and Media for branches where caller is editor/owner
router.get(
    "/pending",
    verifyToken,
    authorizeRoles("admin", "editor", "member"), // broader access; controller filters by branch roles
    modController.getPending
);

// PUT /api/moderation/:id
// Approve or reject a specific Post or Media item
router.put(
    "/:id",
    verifyToken,
    authorizeRoles("admin", "editor", "member"), // controller validates branch role
    modController.updateStatus
);

module.exports = router;
