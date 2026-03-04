"use strict";
/**
 * exportRoutes.js — Phase 3: GEDCOM & CSV Export
 */
const express = require("express");
const router = express.Router({ mergeParams: true }); // mergeParams allows access to :id from parent router
const exportController = require("../controllers/exportController");
const { verifyToken, authorizeRoles } = require("../middlewares/authMiddleware");

// GET /api/branches/:id/export/gedcom
// Download the entire branch as a GEDCOM 7.0 file
router.get(
    "/gedcom",
    verifyToken,
    authorizeRoles("admin", "editor", "member"),
    exportController.exportGedcom
);

// GET /api/branches/:id/export/csv
// Download the entire branch as a ZIP containing persons.csv + relationships.csv
router.get(
    "/csv",
    verifyToken,
    authorizeRoles("admin", "editor", "member"),
    exportController.exportCsv
);

module.exports = router;
