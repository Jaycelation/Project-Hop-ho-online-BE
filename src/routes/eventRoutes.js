const express = require("express");
const router = express.Router();
const eventController = require("../controllers/eventController");
const { verifyToken, authorizeBranchAccess, authorizeRoles } = require("../middlewares/authMiddleware");
const validate = require("../middlewares/validate");
const { createEventSchema, updateEventSchema } = require("../validators/eventValidator");

// ─── Create Event (branch editor+) ────────────────────────────────────────────
router.post(
    "/",
    verifyToken,
    authorizeBranchAccess("editor"),
    validate(createEventSchema),
    eventController.createEvent
);

// ─── List Events (any member — controller privacy-filters) ────────────────────
router.get("/", verifyToken, eventController.listEvents);

// ─── Get Event (privacy check in controller) ───────────────────────────────────
router.get("/:id", verifyToken, eventController.getEvent);

// ─── Update Event (EDITOR+) ───────────────────────────────────────────────────
router.put(
    "/:id",
    verifyToken,
    authorizeRoles("admin", "editor"),
    validate(updateEventSchema),
    eventController.updateEvent
);

// ─── Delete Event (EDITOR+) ───────────────────────────────────────────────────
router.delete(
    "/:id",
    verifyToken,
    authorizeRoles("admin", "editor"),
    eventController.deleteEvent
);

module.exports = router;
