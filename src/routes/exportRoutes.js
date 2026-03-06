const express = require("express");
// QUAN TRỌNG: Phải có mergeParams: true để lấy được req.params.id từ branchRoutes truyền sang
const router = express.Router({ mergeParams: true }); 
const exportController = require("../controllers/exportController");
const { verifyToken, authorizeRoles, authorizeBranchAccess } = require("../middlewares/authMiddleware");

// GET /api/branches/:id/export/gedcom
// Chỉ những người có quyền trong chi nhánh (viewer trở lên) mới được xuất file
router.get(
    "/gedcom", 
    verifyToken, 
    authorizeBranchAccess("viewer"), 
    exportController.exportGedcom
);

// GET /api/branches/:id/export/csv
router.get(
    "/csv", 
    verifyToken, 
    authorizeBranchAccess("viewer"), 
    exportController.exportCsv
);

module.exports = router;