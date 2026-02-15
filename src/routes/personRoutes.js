const express = require("express");
const router = express.Router();
const personController = require("../controllers/personController");
const { verifyToken, authorizeRoles } = require("../middlewares/authMiddleware");

// Create (EDITOR+)
router.post("/", verifyToken, authorizeRoles("admin", "editor"), personController.createPerson);

// List
router.get("/", verifyToken, personController.listPersons);

// Tree
router.get("/:id/tree", verifyToken, personController.getTree);

// Details
router.get("/:id", verifyToken, personController.getPerson);

// Ancestors
router.get("/:id/ancestors", verifyToken, personController.getAncestors);

// Descendants
router.get("/:id/descendants", verifyToken, personController.getDescendants);

// Update (EDITOR+)
router.put("/:id", verifyToken, authorizeRoles("admin", "editor"), personController.updatePerson);

// Delete (ADMIN/EDITOR)
router.delete("/:id", verifyToken, authorizeRoles("admin", "editor"), personController.deletePerson);

module.exports = router;
