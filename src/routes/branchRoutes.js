const express = require("express");
const router = express.Router();
const branchController = require("../controllers/branchController");
const { verifyToken, authorizeRoles } = require("../middlewares/authMiddleware");
const validate = require("../middlewares/validate");
const { createBranchSchema, updateBranchSchema, addMemberSchema } = require("../validators/branchValidator");

// List all accessible branches
router.get("/", verifyToken, branchController.listBranches);

// Create branch (EDITOR+)
router.post("/", verifyToken, authorizeRoles("admin", "editor"), validate(createBranchSchema), branchController.createBranch);

// Get branch details
router.get("/:id", verifyToken, branchController.getBranch);

// Update branch (EDITOR+)
router.put("/:id", verifyToken, authorizeRoles("admin", "editor"), validate(updateBranchSchema), branchController.updateBranch);

// Delete branch (ADMIN)
router.delete("/:id", verifyToken, authorizeRoles("admin"), branchController.deleteBranch);

// Members management
router.get("/:id/members", verifyToken, authorizeRoles("admin", "editor"), branchController.listMembers);
router.post("/:id/members", verifyToken, authorizeRoles("admin", "editor"), validate(addMemberSchema), branchController.addMember);
router.delete("/:id/members/:userId", verifyToken, authorizeRoles("admin", "editor"), branchController.removeMember);

module.exports = router;
