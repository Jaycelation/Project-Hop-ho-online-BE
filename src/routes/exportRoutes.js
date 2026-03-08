const express = require("express");
const router = express.Router({ mergeParams: true });
const exportController = require("../controllers/exportController");
const { verifyToken, authorizeBranchAccess } = require("../middlewares/authMiddleware");

router.get("/gedcom", verifyToken, authorizeBranchAccess("viewer", { paths: ["params.id"] }), exportController.exportGedcom);
router.get("/csv", verifyToken, authorizeBranchAccess("viewer", { paths: ["params.id"] }), exportController.exportCsv);

module.exports = router;
