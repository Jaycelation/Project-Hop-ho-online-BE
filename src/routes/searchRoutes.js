const express = require("express");
const router = express.Router();
const searchController = require("../controllers/searchController");
const { verifyToken } = require("../middlewares/authMiddleware");

router.get("/persons", verifyToken, searchController.searchPersons);

module.exports = router;
