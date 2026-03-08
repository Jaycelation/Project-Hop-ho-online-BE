const express = require("express");
const router = express.Router();
const relController = require("../controllers/relationshipController");
const Relationship = require("../models/RelationshipModel");
const Person = require("../models/PersonModel");
const { verifyToken, authorizeRoles, authorizeBranchAccess, authorizeResourceBranchAccess } = require("../middlewares/authMiddleware");
const validate = require("../middlewares/validate");
const { createRelationshipSchema, updateRelationshipSchema } = require("../validators/relationshipValidator");

router.post("/", verifyToken, authorizeRoles("admin", "editor"), authorizeBranchAccess("editor", { paths: ["body.branchId"] }), validate(createRelationshipSchema), relController.createRelationship);
router.get("/person/:personId", verifyToken, authorizeResourceBranchAccess(Person, "viewer", { resourceName: "Person", param: "personId" }), relController.getPersonRelationships);
router.get("/:id", verifyToken, authorizeResourceBranchAccess(Relationship, "viewer", { resourceName: "Relationship" }), relController.getRelationship);
router.put("/:id", verifyToken, authorizeRoles("admin", "editor"), authorizeResourceBranchAccess(Relationship, "editor", { resourceName: "Relationship" }), validate(updateRelationshipSchema), relController.updateRelationship);
router.delete("/:id", verifyToken, authorizeRoles("admin", "editor"), authorizeResourceBranchAccess(Relationship, "editor", { resourceName: "Relationship" }), relController.deleteRelationship);

module.exports = router;
