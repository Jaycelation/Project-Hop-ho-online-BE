const express = require("express");
const router = express.Router();
const branchController = require("../controllers/branchController");
const { verifyToken, authorizeRoles } = require("../middlewares/authMiddleware");

// List Branches (MEMBER+)
router.get("/", verifyToken, branchController.listBranches);

// Create Branch (ADMIN/EDITOR)
router.post("/", verifyToken, authorizeRoles("admin", "editor"), branchController.createBranch);

// Branch Details
router.get("/:id", verifyToken, branchController.getBranch);

// Update Branch (ADMIN/EDITOR)
router.put("/:id", verifyToken, authorizeRoles("admin", "editor"), branchController.updateBranch);

// Delete Branch (ADMIN)
router.delete("/:id", verifyToken, authorizeRoles("admin"), branchController.deleteBranch);

// Members Management (ADMIN/EDITOR)
router.get("/:id/members", verifyToken, authorizeRoles("admin", "editor"), branchController.listMembers);
router.post("/:id/members", verifyToken, authorizeRoles("admin", "editor"), branchController.addMember);
router.delete("/:id/members/:userId", verifyToken, authorizeRoles("admin", "editor"), branchController.removeMember);

module.exports = router;
