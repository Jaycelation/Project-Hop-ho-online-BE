const express = require("express");
const router = express.Router();
const relController = require("../controllers/relationshipController");
const { verifyToken, authorizeRoles } = require("../middlewares/authMiddleware");
const validate = require("../middlewares/validate");
const { createRelationshipSchema, updateRelationshipSchema } = require("../validators/relationshipValidator");

// Create (EDITOR+)
router.post("/", verifyToken, authorizeRoles("admin", "editor"), validate(createRelationshipSchema), relController.createRelationship);

// Get by Person
router.get("/person/:personId", verifyToken, relController.getPersonRelationships);

// Get by ID
router.get("/:id", verifyToken, relController.getRelationship);

// // Get by Person
// router.get("/person/:personId", verifyToken, relController.getPersonRelationships);

// Update (EDITOR+)
router.put("/:id", verifyToken, authorizeRoles("admin", "editor"), validate(updateRelationshipSchema), relController.updateRelationship);

// Delete (EDITOR+)
router.delete("/:id", verifyToken, authorizeRoles("admin", "editor"), relController.deleteRelationship);

module.exports = router;
