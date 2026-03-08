const express = require("express");
const router = express.Router();
const personController = require("../controllers/personController");
const Person = require("../models/PersonModel");
const { verifyToken, authorizeRoles, authorizeBranchAccess, authorizeResourceBranchAccess } = require("../middlewares/authMiddleware");
const validate = require("../middlewares/validate");
const { createPersonSchema, updatePersonSchema } = require("../validators/personValidator");

router.post("/", verifyToken, authorizeRoles("admin", "editor"), authorizeBranchAccess("editor", { paths: ["body.branchId"] }), validate(createPersonSchema), personController.createPerson);
router.get("/", verifyToken, authorizeBranchAccess("viewer", { paths: ["query.branchId"], optional: true }), personController.listPersons);
router.get("/:id", verifyToken, authorizeResourceBranchAccess(Person, "viewer", { resourceName: "Person" }), personController.getPerson);
router.get("/:id/tree", verifyToken, authorizeResourceBranchAccess(Person, "viewer", { resourceName: "Person" }), personController.getTree);
router.get("/:id/ancestors", verifyToken, authorizeResourceBranchAccess(Person, "viewer", { resourceName: "Person" }), personController.getAncestors);
router.get("/:id/descendants", verifyToken, authorizeResourceBranchAccess(Person, "viewer", { resourceName: "Person" }), personController.getDescendants);
router.get("/:id/kinship/:targetId", verifyToken, authorizeResourceBranchAccess(Person, "viewer", { resourceName: "Person" }), personController.getKinship);
router.put("/:id", verifyToken, authorizeRoles("admin", "editor"), authorizeResourceBranchAccess(Person, "editor", { resourceName: "Person" }), validate(updatePersonSchema), personController.updatePerson);
router.delete("/:id", verifyToken, authorizeRoles("admin", "editor"), authorizeResourceBranchAccess(Person, "editor", { resourceName: "Person" }), personController.deletePerson);

module.exports = router;
