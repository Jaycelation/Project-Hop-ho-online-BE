const express = require("express");
const router = express.Router();
const searchController = require("../controllers/searchController");
const { verifyToken, authorizeBranchAccess } = require("../middlewares/authMiddleware");

router.get("/persons", verifyToken, authorizeBranchAccess("viewer", { paths: ["query.branchId"], optional: true }), searchController.searchPersons);
router.get("/events", verifyToken, authorizeBranchAccess("viewer", { paths: ["query.branchId"], optional: true }), searchController.searchEvents);
router.get("/branches", verifyToken, searchController.searchBranches);

module.exports = router;
