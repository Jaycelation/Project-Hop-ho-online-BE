const Person = require("../models/PersonModel");
const Event = require("../models/EventModel");
const Branch = require("../models/BranchModel");
const { success, error } = require("../utils/responseHandler");
const securityGuard = require("../utils/securityGuard");
const { getAccessibleBranchIds } = require("../middlewares/authMiddleware");

exports.searchPersons = async (req, res) => {
    try {
        const { q, branchId, privacy, generation } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        if (!q) {
            return error(res, { code: "MISSING_QUERY", message: "Query parameter 'q' is required" }, 400);
        }

        const accessibleBranchIds = await getAccessibleBranchIds(req.user, "viewer");
        if (!accessibleBranchIds.length) {
            return success(res, [], { page, limit, total: 0, totalPages: 0 });
        }

        let query = { $text: { $search: q }, branchId: { $in: accessibleBranchIds } };

        if (branchId) {
            if (!accessibleBranchIds.includes(branchId)) {
                return error(res, { code: "FORBIDDEN_BRANCH_ACCESS", message: "Access denied to this branch" }, 403);
            }
            query.branchId = branchId;
        }
        if (privacy) query.privacy = privacy;
        if (generation) query.generation = parseInt(generation, 10);

        const persons = await Person.find(query, { score: { $meta: "textScore" } })
            .sort({ score: { $meta: "textScore" } })
            .skip((page - 1) * limit)
            .limit(limit);

        const filtered = [];
        for (const person of persons) {
            const hasAccess = await securityGuard.checkPrivacy(person, req.user);
            if (hasAccess) filtered.push(person);
        }

        return success(res, filtered, { page, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit) });
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

        const accessibleBranchIds = await getAccessibleBranchIds(req.user, "viewer");
        if (!accessibleBranchIds.length) {
            return success(res, [], { page, limit, total: 0, totalPages: 0 });
        }

        let query = { $text: { $search: q }, branchId: { $in: accessibleBranchIds } };
        if (branchId) {
            if (!accessibleBranchIds.includes(branchId)) {
                return error(res, { code: "FORBIDDEN_BRANCH_ACCESS", message: "Access denied to this branch" }, 403);
            }
            query.branchId = branchId;
        }

        const events = await Event.find(query, { score: { $meta: "textScore" } })
            .sort({ score: { $meta: "textScore" } })
            .skip((page - 1) * limit)
            .limit(limit);

        const filtered = [];
        for (const event of events) {
            const hasAccess = await securityGuard.checkPrivacy(event, req.user);
            if (hasAccess) filtered.push(event);
        }

        return success(res, filtered, { page, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit) });
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

        let query = {
            $or: [
                { name: { $regex: q, $options: "i" } },
                { description: { $regex: q, $options: "i" } },
            ],
        };

        if (req.user.role !== "admin") {
            query = {
                $and: [
                    query,
                    {
                        $or: [
                            { ownerId: req.user.id },
                            { "members.userId": req.user.id },
                        ],
                    },
                ],
            };
        }

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
