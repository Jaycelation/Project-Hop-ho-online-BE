const express = require("express");
const router = express.Router();
const personController = require("../controllers/personController");
const { verifyToken, authorizeRoles } = require("../middlewares/authMiddleware");
const validate = require("../middlewares/validate");
const { createPersonSchema, updatePersonSchema } = require("../validators/personValidator");

// Create Person (EDITOR+)
router.post("/", verifyToken, authorizeRoles("admin", "editor"), validate(createPersonSchema), personController.createPerson);

// List Persons
router.get("/", verifyToken, personController.listPersons);

// Get Person Details (with privacy check in controller)
router.get("/:id", verifyToken, personController.getPerson);

// Get Family Tree
router.get("/:id/tree", verifyToken, personController.getTree);

// Get Ancestors
router.get("/:id/ancestors", verifyToken, personController.getAncestors);

// Get Descendants
router.get("/:id/descendants", verifyToken, personController.getDescendants);

// Update Person (EDITOR+)
router.put("/:id", verifyToken, authorizeRoles("admin", "editor"), validate(updatePersonSchema), personController.updatePerson);

// Delete Person (EDITOR+)
router.delete("/:id", verifyToken, authorizeRoles("admin", "editor"), personController.deletePerson);

module.exports = router;
