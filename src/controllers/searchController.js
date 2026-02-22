const Person = require("../models/PersonModel");
const Event = require("../models/EventModel");
const Branch = require("../models/BranchModel");
const { success, error } = require("../utils/responseHandler");

exports.searchPersons = async (req, res) => {
    try {
        const { q, branchId, privacy, generation } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        if (!q) {
            return error(res, { code: "MISSING_QUERY", message: "Query parameter 'q' is required" }, 400);
        }

        let query = { $text: { $search: q } };

        if (branchId) query.branchId = branchId;
        if (privacy) query.privacy = privacy;
        if (generation) query.generation = parseInt(generation);

        const persons = await Person.find(query, { score: { $meta: "textScore" } })
            .sort({ score: { $meta: "textScore" } })
            .skip((page - 1) * limit)
            .limit(limit);

        const total = await Person.countDocuments(query);

        return success(res, persons, { page, limit, total, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        return error(res, err);
    }
};

exports.searchEvents = async (req, res) => {
    try {
        const { q, branchId } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        if (!q) {
            return error(res, { code: "MISSING_QUERY", message: "Query parameter 'q' is required" }, 400);
        }

        let query = { $text: { $search: q } };
        if (branchId) query.branchId = branchId;

        const events = await Event.find(query, { score: { $meta: "textScore" } })
            .sort({ score: { $meta: "textScore" } })
            .skip((page - 1) * limit)
            .limit(limit);

        const total = await Event.countDocuments(query);

        return success(res, events, { page, limit, total, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        return error(res, err);
    }
};

exports.searchBranches = async (req, res) => {
    try {
        const { q } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        if (!q) {
            return error(res, { code: "MISSING_QUERY", message: "Query parameter 'q' is required" }, 400);
        }

        // Branch doesn't have text index, so use regex search
        const query = {
            $or: [
                { name: { $regex: q, $options: "i" } },
                { description: { $regex: q, $options: "i" } }
            ]
        };

        const branches = await Branch.find(query)
            .skip((page - 1) * limit)
            .limit(limit)
            .sort({ createdAt: -1 })
            .populate("ownerId", "fullName email");

        const total = await Branch.countDocuments(query);

        return success(res, branches, { page, limit, total, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        return error(res, err);
    }
};
