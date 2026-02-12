const Person = require("../models/PersonModel");
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

        // Sorting by text score to get best matches first
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
