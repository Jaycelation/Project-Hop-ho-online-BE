const express = require("express");
const router = express.Router();
const eventController = require("../controllers/eventController");
const { verifyToken, authorizeRoles } = require("../middlewares/authMiddleware");
const validate = require("../middlewares/validate");
const { createEventSchema, updateEventSchema } = require("../validators/eventValidator");

router.post("/", verifyToken, authorizeRoles("admin", "editor"), validate(createEventSchema), eventController.createEvent);
router.get("/", verifyToken, eventController.listEvents);
router.get("/:id", verifyToken, eventController.getEvent);
router.put("/:id", verifyToken, authorizeRoles("admin", "editor"), validate(updateEventSchema), eventController.updateEvent);
router.delete("/:id", verifyToken, authorizeRoles("admin", "editor"), eventController.deleteEvent);

module.exports = router;
