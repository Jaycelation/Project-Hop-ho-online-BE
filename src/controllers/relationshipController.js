const Relationship = require("../models/RelationshipModel");
const { success, error } = require("../utils/responseHandler");
const logAudit = require("../utils/auditLogger");

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

        await logAudit({
            actorId: req.user.id,
            action: "CREATE",
            entityType: "Relationship",
            entityId: rel._id,
            branchId: rel.branchId,
            after: rel
        }, req);

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

        if (!rel) return error(res, { code: "NOT_FOUND", message: "Relationship not found" }, 404);
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

// Update Relationship (change type)
exports.updateRelationship = async (req, res) => {
    try {
        const originalRel = await Relationship.findById(req.params.id);
        if (!originalRel) return error(res, { code: "NOT_FOUND", message: "Relationship not found" }, 404);

        const { type } = req.body;
        const updateFields = {};
        if (type !== undefined) updateFields.type = type;

        const rel = await Relationship.findByIdAndUpdate(
            req.params.id,
            updateFields,
            { new: true, runValidators: true }
        );

        await logAudit({
            actorId: req.user.id,
            action: "UPDATE",
            entityType: "Relationship",
            entityId: rel._id,
            branchId: rel.branchId,
            before: originalRel,
            after: rel
        }, req);

        return success(res, rel);
    } catch (err) {
        return error(res, err);
    }
};

exports.deleteRelationship = async (req, res) => {
    try {
        const rel = await Relationship.findByIdAndDelete(req.params.id);
        if (!rel) return error(res, { code: "NOT_FOUND", message: "Relationship not found" }, 404);

        await logAudit({
            actorId: req.user.id,
            action: "DELETE",
            entityType: "Relationship",
            entityId: rel._id,
            branchId: rel.branchId,
            before: rel
        }, req);

        return success(res, { message: "Relationship deleted" });
    } catch (err) {
        return error(res, err);
    }
};
