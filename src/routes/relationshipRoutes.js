const express = require("express");
const router = express.Router();
const relController = require("../controllers/relationshipController");
const { verifyToken, authorizeRoles } = require("../middlewares/authMiddleware");

// Create (EDITOR+)
router.post("/", verifyToken, authorizeRoles("admin", "editor"), relController.createRelationship);

// Get by ID
router.get("/:id", verifyToken, relController.getRelationship);

// Get by Person
router.get("/person/:personId", verifyToken, relController.getPersonRelationships);

// Delete (EDITOR+)
router.delete("/:id", verifyToken, authorizeRoles("admin", "editor"), relController.deleteRelationship);

module.exports = router;
