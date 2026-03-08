const express = require("express");
const router = express.Router();
const branchController = require("../controllers/branchController");
const importController = require("../controllers/importController");
const exportController = require("../controllers/exportController");
const upload = require("../middlewares/uploadMiddleware");
const { verifyToken, authorizeRoles, authorizeBranchAccess } = require("../middlewares/authMiddleware");
const validate = require("../middlewares/validate");
const { createBranchSchema, updateBranchSchema, addMemberSchema } = require("../validators/branchValidator");

router.get("/", verifyToken, branchController.listBranches);
router.post("/", verifyToken, authorizeRoles("admin", "editor"), validate(createBranchSchema), branchController.createBranch);
router.get("/:id", verifyToken, authorizeBranchAccess("viewer", { paths: ["params.id"] }), branchController.getBranch);
router.put("/:id", verifyToken, authorizeRoles("admin", "editor"), authorizeBranchAccess("editor", { paths: ["params.id"] }), validate(updateBranchSchema), branchController.updateBranch);
router.delete("/:id", verifyToken, authorizeRoles("admin"), branchController.deleteBranch);
router.get("/:id/members", verifyToken, authorizeRoles("admin", "editor"), authorizeBranchAccess("editor", { paths: ["params.id"] }), branchController.listMembers);
router.post("/:id/members", verifyToken, authorizeRoles("admin", "editor"), authorizeBranchAccess("editor", { paths: ["params.id"] }), validate(addMemberSchema), branchController.addMember);
router.delete("/:id/members/:userId", verifyToken, authorizeRoles("admin", "editor"), authorizeBranchAccess("editor", { paths: ["params.id"] }), branchController.removeMember);
router.get("/:id/export/gedcom", verifyToken, authorizeBranchAccess("viewer", { paths: ["params.id"] }), exportController.exportGedcom);
router.get("/:id/export/csv", verifyToken, authorizeBranchAccess("viewer", { paths: ["params.id"] }), exportController.exportCsv);
router.post("/:id/import-csv", verifyToken, authorizeRoles("admin", "editor"), authorizeBranchAccess("editor", { paths: ["params.id"] }), upload.csvUpload.single("file"), importController.importCsv);

module.exports = router;
