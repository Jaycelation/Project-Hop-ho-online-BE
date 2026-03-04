const Relationship = require("../models/RelationshipModel");
const { success, error } = require("../utils/responseHandler");
const logAudit = require("../utils/auditLogger");

/**
 * Recursively gather all ancestor IDs of a given personId via parent_of edges.
 * Returns a Set of ancestor ID strings.
 */
async function getAncestorIds(personId, visited = new Set()) {
    if (visited.has(personId)) return visited;
    visited.add(personId);

    // parent_of: fromPerson = Parent, toPerson = Child
    // To find parents of personId, look for rels where toPersonId = personId
    const parentRels = await Relationship.find({
        toPersonId: personId,
        type: "parent_of"
    }).select("fromPersonId").lean();

    for (const rel of parentRels) {
        await getAncestorIds(rel.fromPersonId.toString(), visited);
    }

    return visited;
}

// ─── Create Relationship ───────────────────────────────────────────────────────
exports.createRelationship = async (req, res) => {
    try {
        const { branchId, fromPersonId, toPersonId, type, status, startDate, endDate, subType, note } = req.body;
        const mongoose = require("mongoose");

        // ── Validate ObjectId formats upfront ──────────────────────────────
        const idsToCheck = { branchId, fromPersonId, toPersonId };
        for (const [field, val] of Object.entries(idsToCheck)) {
            if (!val || !mongoose.Types.ObjectId.isValid(val)) {
                return error(res, {
                    code: "INVALID_OBJECT_ID",
                    message: `Trường '${field}' không phải ObjectId hợp lệ: '${val}'`
                }, 422);
            }
        }

        // Validation 1: Self-reference check (A is their own parent/spouse/sibling)
        if (fromPersonId.toString() === toPersonId.toString()) {
            return error(res, {
                code: "RELATIONSHIP_SELF_REFERENCE",
                message: "A person cannot have a relationship with themselves"
            }, 422);
        }

        // Validation 2: Duplicate relationship
        const existing = await Relationship.findOne({ branchId, fromPersonId, toPersonId, type });
        if (existing) {
            return error(res, { code: "RELATIONSHIP_EXISTS", message: "Relationship already exists" }, 409);
        }

        // Validation 3: Circular ancestor check (only for parent_of)
        // Rule: fromPerson = Parent, toPersonId = Child
        // If toPersonId is already an ancestor of fromPersonId → circular
        if (type === "parent_of") {
            const ancestorsOfParent = await getAncestorIds(fromPersonId.toString());
            if (ancestorsOfParent.has(toPersonId.toString())) {
                return error(res, {
                    code: "RELATIONSHIP_CIRCULAR",
                    message: "Cannot create this relationship: it would create a circular ancestry"
                }, 422);
            }
        }

        const rel = await Relationship.create({
            branchId,
            fromPersonId,
            toPersonId,
            type,
            status: status || "unknown",
            startDate: startDate || "",
            endDate: endDate || "",
            subType: subType || "biological",
            note: note || "",
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


// ─── Get Single Relationship ───────────────────────────────────────────────────
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

// ─── Get All Relationships for a Person ───────────────────────────────────────
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

// ─── Update Relationship ───────────────────────────────────────────────────────
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

// ─── Delete Relationship ───────────────────────────────────────────────────────
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
