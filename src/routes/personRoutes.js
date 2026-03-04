const express = require("express");
const router = express.Router();
const personController = require("../controllers/personController");
const { verifyToken, authorizeRoles, authorizeBranchAccess } = require("../middlewares/authMiddleware");
const validate = require("../middlewares/validate");
const { createPersonSchema, updatePersonSchema } = require("../validators/personValidator");

// ─── Create Person (branch editor+) ───────────────────────────────────────────
// branchId comes from req.body → authorizeBranchAccess reads it correctly
router.post(
    "/",
    verifyToken,
    authorizeBranchAccess("editor"),
    validate(createPersonSchema),
    personController.createPerson
);

// ─── List Persons (any authenticated user — controller applies privacy filter) ─
router.get("/", verifyToken, personController.listPersons);

// ─── Get Person Details (privacy check in controller) ─────────────────────────
router.get("/:id", verifyToken, personController.getPerson);

// ─── Get Family Tree (privacy check in controller) ────────────────────────────
router.get("/:id/tree", verifyToken, personController.getTree);

// ─── Get Ancestors ─────────────────────────────────────────────────────────────
router.get("/:id/ancestors", verifyToken, personController.getAncestors);

// ─── Get Descendants ──────────────────────────────────────────────────────────
router.get("/:id/descendants", verifyToken, personController.getDescendants);

// ─── Phase 2: Kinship Calculator ──────────────────────────────────────────────
// Returns Vietnamese xưng hô (e.g. "Ông nội", "Cháu", "Chú họ") between two persons
router.get("/:id/kinship/:targetId", verifyToken, personController.getKinship);


// ─── Update Person (branch editor+) ───────────────────────────────────────────
// Note: for update/delete by id, branchId must come from the person doc.
// We fall back to authorizeRoles here since the person's branchId is not in req.body typically.
// Controllers can do an additional ownership check if needed.
router.put(
    "/:id",
    verifyToken,
    authorizeRoles("admin", "editor"),
    validate(updatePersonSchema),
    personController.updatePerson
);

// ─── Delete Person (branch editor+) ───────────────────────────────────────────
router.delete(
    "/:id",
    verifyToken,
    authorizeRoles("admin", "editor"),
    personController.deletePerson
);

module.exports = router;
