const express = require("express");
const router = express.Router();
const relController = require("../controllers/relationshipController");
const { verifyToken, authorizeBranchAccess, authorizeRoles } = require("../middlewares/authMiddleware");
const validate = require("../middlewares/validate");
const { createRelationshipSchema, updateRelationshipSchema } = require("../validators/relationshipValidator");

// ─── Create Relationship (branch editor+) ────────────────────────────────────
// branchId comes from req.body → authorizeBranchAccess reads it correctly
router.post(
    "/",
    verifyToken,
    authorizeBranchAccess("editor"),
    validate(createRelationshipSchema),
    relController.createRelationship
);

// ─── Get Relationships by Person ──────────────────────────────────────────────
router.get("/person/:personId", verifyToken, relController.getPersonRelationships);

// ─── Get by ID ─────────────────────────────────────────────────────────────────
router.get("/:id", verifyToken, relController.getRelationship);

// ─── Update Relationship (EDITOR+) ────────────────────────────────────────────
router.put(
    "/:id",
    verifyToken,
    authorizeRoles("admin", "editor"),
    validate(updateRelationshipSchema),
    relController.updateRelationship
);

// ─── Delete Relationship (EDITOR+) ────────────────────────────────────────────
router.delete(
    "/:id",
    verifyToken,
    authorizeRoles("admin", "editor"),
    relController.deleteRelationship
);

module.exports = router;
