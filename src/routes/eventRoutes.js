const express = require("express");
const router = express.Router();
const eventController = require("../controllers/eventController");
const Event = require("../models/EventModel");
const { verifyToken, authorizeRoles, authorizeBranchAccess, authorizeResourceBranchAccess } = require("../middlewares/authMiddleware");
const validate = require("../middlewares/validate");
const { createEventSchema, updateEventSchema } = require("../validators/eventValidator");

router.post("/", verifyToken, authorizeRoles("admin", "editor"), authorizeBranchAccess("editor", { paths: ["body.branchId"] }), validate(createEventSchema), eventController.createEvent);
router.get("/", verifyToken, authorizeBranchAccess("viewer", { paths: ["query.branchId"], optional: true }), eventController.listEvents);
router.get("/:id", verifyToken, authorizeResourceBranchAccess(Event, "viewer", { resourceName: "Event" }), eventController.getEvent);
router.put("/:id", verifyToken, authorizeRoles("admin", "editor"), authorizeResourceBranchAccess(Event, "editor", { resourceName: "Event" }), validate(updateEventSchema), eventController.updateEvent);
router.delete("/:id", verifyToken, authorizeRoles("admin", "editor"), authorizeResourceBranchAccess(Event, "editor", { resourceName: "Event" }), eventController.deleteEvent);

module.exports = router;
