const Event = require("../models/EventModel");
const { success, error } = require("../utils/responseHandler");
const logAudit = require("../utils/auditLogger");
const securityGuard = require("../utils/securityGuard");

exports.createEvent = async (req, res) => {
    try {
        const { branchId, title, type, eventDate, location, description, personIds, privacy } = req.body;

        const event = await Event.create({
            branchId,
            title,
            type,
            eventDate,
            location,
            description,
            personIds,
            privacy,
            createdBy: req.user.id
        });

        await logAudit({
            actorId: req.user.id,
            action: "CREATE",
            entityType: "Event",
            entityId: event._id,
            branchId: event.branchId,
            after: event
        }, req);

        return success(res, event, null, 201);
    } catch (err) {
        return error(res, err);
    }
};

exports.listEvents = async (req, res) => {
    try {
        const { branchId, personId } = req.query;
        const dateFrom = req.query.dateFrom || req.query.startDate;
        const dateTo = req.query.dateTo || req.query.endDate;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        let query = {};
        if (branchId) query.branchId = branchId;
        if (personId) query.personIds = personId;
        if (dateFrom || dateTo) {
            query.eventDate = {};
            if (dateFrom) query.eventDate.$gte = new Date(dateFrom);
            if (dateTo) query.eventDate.$lte = new Date(dateTo);
        }

        const events = await Event.find(query)
            .skip((page - 1) * limit)
            .limit(limit)
            .sort({ eventDate: -1 });

        // Filter by privacy — remove items user cannot see
        const filtered = [];
        for (const evt of events) {
            const hasAccess = await securityGuard.checkPrivacy(evt, req.user);
            if (hasAccess) filtered.push(evt);
        }

        const total = await Event.countDocuments(query);

        return success(res, filtered, { page, limit, total, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        return error(res, err);
    }
};

exports.getEvent = async (req, res) => {
    try {
        const event = await Event.findById(req.params.id)
            .populate("personIds", "fullName");

        if (!event) return error(res, { code: "NOT_FOUND", message: "Event not found" }, 404);

        const hasAccess = await securityGuard.checkPrivacy(event, req.user);
        if (!hasAccess) {
            return error(res, { code: "FORBIDDEN_PRIVATE_RESOURCE", message: "You do not have access to this event" }, 403);
        }

        return success(res, event);
    } catch (err) {
        return error(res, err);
    }
};

exports.updateEvent = async (req, res) => {
    try {
        const originalEvent = await Event.findById(req.params.id);
        if (!originalEvent) return error(res, { code: "NOT_FOUND", message: "Event not found" }, 404);

        const event = await Event.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedBy: req.user.id },
            { new: true, runValidators: true }
        );

        await logAudit({
            actorId: req.user.id,
            action: "UPDATE",
            entityType: "Event",
            entityId: event._id,
            branchId: event.branchId,
            before: originalEvent,
            after: event
        }, req);

        return success(res, event);
    } catch (err) {
        return error(res, err);
    }
};

exports.deleteEvent = async (req, res) => {
    try {
        const event = await Event.findByIdAndDelete(req.params.id);
        if (!event) return error(res, { code: "NOT_FOUND", message: "Event not found" }, 404);

        await logAudit({
            actorId: req.user.id,
            action: "DELETE",
            entityType: "Event",
            entityId: event._id,
            branchId: event.branchId,
            before: event
        }, req);

        return success(res, { message: "Event deleted" });
    } catch (err) {
        return error(res, err);
    }
};
