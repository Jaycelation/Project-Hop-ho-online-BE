const Relationship = require("../models/RelationshipModel");
const { success, error } = require("../utils/responseHandler");

exports.createRelationship = async (req, res) => {
    try {
        const { branchId, fromPersonId, toPersonId, type } = req.body;

        // Validation check for duplicates
        const existing = await Relationship.findOne({ fromPersonId, toPersonId, type });
        if (existing) {
            return error(res, { code: "RELATIONSHIP_EXISTS", message: "Relationship already exists" }, 409);
        }

        const rel = await Relationship.create({
            branchId,
            fromPersonId,
            toPersonId,
            type,
            createdBy: req.user.id
        });

        return success(res, rel, null, 201);
    } catch (err) {
        return error(res, err);
    }
};

exports.getRelationship = async (req, res) => {
    try {
        const rel = await Relationship.findById(req.params.id)
            .populate("fromPersonId", "fullName")
            .populate("toPersonId", "fullName");

        if (!rel) return error(res, { code: "NOT_FOUND" }, 404);
        return success(res, rel);
    } catch (err) {
        return error(res, err);
    }
};

exports.getPersonRelationships = async (req, res) => {
    try {
        const { personId } = req.params;
        const rels = await Relationship.find({
            $or: [{ fromPersonId: personId }, { toPersonId: personId }]
        })
            .populate("fromPersonId", "fullName")
            .populate("toPersonId", "fullName");

        return success(res, rels);
    } catch (err) {
        return error(res, err);
    }
};

exports.deleteRelationship = async (req, res) => {
    try {
        const rel = await Relationship.findByIdAndDelete(req.params.id);
        if (!rel) return error(res, { code: "NOT_FOUND" }, 404);
        return success(res, { message: "Relationship deleted" });
    } catch (err) {
        return error(res, err);
    }
};
