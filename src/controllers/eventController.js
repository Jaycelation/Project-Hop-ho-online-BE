const Event = require("../models/EventModel");
const { success, error } = require("../utils/responseHandler");

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

        const total = await Event.countDocuments(query);

        return success(res, events, { page, limit, total, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        return error(res, err);
    }
};

exports.getEvent = async (req, res) => {
    try {
        const event = await Event.findById(req.params.id)
            .populate("personIds", "fullName");

        if (!event) return error(res, { code: "NOT_FOUND" }, 404);
        return success(res, event);
    } catch (err) {
        return error(res, err);
    }
};

exports.updateEvent = async (req, res) => {
    try {
        const event = await Event.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedBy: req.user.id },
            { new: true, runValidators: true }
        );
        if (!event) return error(res, { code: "NOT_FOUND" }, 404);
        return success(res, event);
    } catch (err) {
        return error(res, err);
    }
};

exports.deleteEvent = async (req, res) => {
    try {
        const event = await Event.findByIdAndDelete(req.params.id);
        if (!event) return error(res, { code: "NOT_FOUND" }, 404);
        return success(res, { message: "Event deleted" });
    } catch (err) {
        return error(res, err);
    }
};
