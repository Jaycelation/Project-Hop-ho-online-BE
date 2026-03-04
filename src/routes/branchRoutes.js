const express = require("express");
const router = express.Router();
const multer = require("multer");
const branchController = require("../controllers/branchController");
const exportRoutes = require("./exportRoutes");
const importController = require("../controllers/importController");
const { verifyToken, authorizeRoles } = require("../middlewares/authMiddleware");
const validate = require("../middlewares/validate");
const { createBranchSchema, updateBranchSchema, addMemberSchema } = require("../validators/branchValidator");

// Multer: store CSV in OS temp dir, 10 MB limit
const csvUpload = multer({
    dest: require("os").tmpdir(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
            cb(null, true);
        } else {
            cb(new Error("Only .csv files are accepted"));
        }
    },
});

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

// Set root person (thủy tổ) for a branch
router.patch("/:id/root", verifyToken, authorizeRoles("admin", "editor"), branchController.setRootPerson);

// Phase 3: GEDCOM & CSV Export routes (GET /api/branches/:id/export/gedcom|csv)
router.use("/:id/export", exportRoutes);

// Phase 3 (Import): CSV Bulk Import  POST /api/branches/:id/import-csv
router.post("/:id/import-csv", verifyToken, authorizeRoles("admin", "editor"), csvUpload.single("file"), importController.importCsv);

module.exports = router;


