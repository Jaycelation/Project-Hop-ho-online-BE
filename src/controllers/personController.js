const Person = require("../models/PersonModel");
const Relationship = require("../models/RelationshipModel");
const Event = require("../models/EventModel");
const Media = require("../models/MediaModel");
const fs = require("fs");
const mongoose = require("mongoose");
const { success, error } = require("../utils/responseHandler");
const logAudit = require("../utils/auditLogger");
const securityGuard = require("../utils/securityGuard");

// Create Person
exports.createPerson = async (req, res) => {
    try {
        const { branchId, fullName, gender, dateOfBirth, dateOfDeath, phone, address, privacy, note, generation } = req.body;

        const person = await Person.create({
            branchId,
            fullName,
            gender,
            dateOfBirth,
            dateOfDeath,
            phone,
            address,
            privacy,
            note,
            generation,
            createdBy: req.user.id
        });

        await logAudit({
            actorId: req.user.id,
            action: "CREATE",
            entityType: "Person",
            entityId: person._id,
            branchId: person.branchId,
            after: person
        }, req);

        return success(res, person, null, 201);
    } catch (err) {
        return error(res, err);
    }
};

// Update Person
exports.updatePerson = async (req, res) => {
    try {
        const originalPerson = await Person.findById(req.params.id);

        const person = await Person.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedBy: req.user.id },
            { new: true, runValidators: true }
        );

        if (!person) {
            return error(res, { code: "PERSON_NOT_FOUND", message: "Person not found" }, 404);
        }

        await logAudit({
            actorId: req.user.id,
            action: "UPDATE",
            entityType: "Person",
            entityId: person._id,
            branchId: person.branchId,
            before: originalPerson,
            after: person
        }, req);

        return success(res, person);
    } catch (err) {
        return error(res, err);
    }
};

// Delete Person
exports.deletePerson = async (req, res) => {
    try {
        const person = await Person.findByIdAndDelete(req.params.id);
        if (!person) {
            return error(res, { code: "PERSON_NOT_FOUND", message: "Person not found" }, 404);
        }
        // Cascade delete relationships
        await Relationship.deleteMany({
            $or: [{ fromPersonId: req.params.id }, { toPersonId: req.params.id }]
        });

        // Cascade delete related events
        await Event.deleteMany({ personIds: req.params.id });

        // Cascade delete related media (and cleanup files)
        const relatedMedia = await Media.find({ personId: req.params.id });
        for (const m of relatedMedia) {
            if (m.storagePath && fs.existsSync(m.storagePath)) {
                fs.unlinkSync(m.storagePath);
            }
        }
        await Media.deleteMany({ personId: req.params.id });

        await logAudit({
            actorId: req.user.id,
            action: "DELETE",
            entityType: "Person",
            entityId: person._id,
            branchId: person.branchId,
            before: person
        }, req);

        return success(res, { message: "Person deleted" });
    } catch (err) {
        return error(res, err);
    }
};

// Get Person Details
exports.getPerson = async (req, res) => {
    try {
        const person = await Person.findById(req.params.id).populate("branchId", "name");
        if (!person) {
            return error(res, { code: "PERSON_NOT_FOUND", message: "Person not found" }, 404);
        }

        const hasAccess = await securityGuard.checkPrivacy(person, req.user);
        if (!hasAccess) {
            return error(res, { code: "FORBIDDEN_PRIVATE_RESOURCE", message: "You do not have access to this person" }, 403);
        }

        return success(res, person);
    } catch (err) {
        return error(res, err);
    }
};

// List Persons
exports.listPersons = async (req, res) => {
    try {
        const { branchId, fullName } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        let query = {};
        if (branchId) query.branchId = branchId;
        if (fullName) query.fullName = { $regex: fullName, $options: "i" };

        const persons = await Person.find(query)
            .skip((page - 1) * limit)
            .limit(limit)
            .sort({ fullName: 1 });

        const total = await Person.countDocuments(query);

        return success(res, persons, { page, limit, total, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        return error(res, err);
    }
};

// Get Tree (Ancestors and Descendants)
// Simplified implementation: returns immediate parents/children/spouses.
// (depth/includeSpouses/format are handled in /ancestors and /descendants endpoints in this codebase)
exports.getTree = async (req, res) => {
    try {
        const { id } = req.params;

        const root = await Person.findById(id);
        if (!root) {
            return error(res, { code: "PERSON_NOT_FOUND", message: "Person not found" }, 404);
        }

        const hasAccess = await securityGuard.checkPrivacy(root, req.user);
        if (!hasAccess) {
            return error(
                res,
                { code: "FORBIDDEN_PRIVATE_RESOURCE", message: "You do not have access to this person" },
                403
            );
        }

        // Parents: rel where toPersonId = child, fromPersonId = parent
        const parentRels = await Relationship.find({ toPersonId: id, type: "parent_of" }).populate("fromPersonId");
        const parents = parentRels.map(r => r.fromPersonId);

        // Children: rel where fromPersonId = parent, toPersonId = child
        const childRels = await Relationship.find({ fromPersonId: id, type: "parent_of" }).populate("toPersonId");
        const children = childRels.map(r => r.toPersonId);

        // Spouses
        const spouseRels = await Relationship.find({
            type: "spouse_of",
            $or: [{ fromPersonId: id }, { toPersonId: id }]
        }).populate("fromPersonId toPersonId");
        const spouses = spouseRels.map(r => (r.fromPersonId._id.toString() === id ? r.toPersonId : r.fromPersonId));

        return success(res, { root, parents, children, spouses });
    } catch (err) {
        return error(res, err);
    }
};

// Get Ancestors (placeholder for deep traversal)
// Get Ancestors (Recurisve)
exports.getAncestors = async (req, res) => {
    try {
        const { id } = req.params;
        const depth = parseInt(req.query.depth) || 5; // Default depth 5

        const ancestors = await Relationship.aggregate([
            {
                $match: {
                    toPersonId: new mongoose.Types.ObjectId(id),
                    type: "parent_of"
                }
            },
            {
                $graphLookup: {
                    from: "relationships",
                    startWith: "$fromPersonId",
                    connectFromField: "fromPersonId",
                    connectToField: "toPersonId",
                    as: "ancestorChain",
                    maxDepth: depth - 1,
                    restrictSearchWithMatch: { type: "parent_of" }
                }
            },
            { $unwind: "$ancestorChain" },
            { $replaceRoot: { newRoot: "$ancestorChain" } },
            // Add the direct parents too since they strictly match the first stage but graphLookup handles the rest?
            // Actually graphLookup on the relationship collection returns RELATIONSHIPS.
            // We need Persons. 
        ]);

        // Simpler approach: Use graphLookup on Person if possible, but links are in Relationship.
        // Standard approach for this schema:
        // 1. Find all parent_of relationships recursively.
        // 2. Extract personIds.
        // 3. Fetch Persons.

        // Alternative: Recursively fetch up to depth. 
        // Given typically small depth, a loop might be cleaner, but let's try a single aggregation from Person perspective if possible? No, links are separate.

        // Let's stick to the graphLookup on relationships.
        // The chain will contain relationships.
        // We want the 'fromPersonId' (the parent) from each relationship.

        const relationships = await Relationship.aggregate([
            { $match: { toPersonId: new mongoose.Types.ObjectId(id), type: "parent_of" } },
            {
                $graphLookup: {
                    from: "relationships",
                    startWith: "$fromPersonId",
                    connectFromField: "fromPersonId",
                    connectToField: "toPersonId",
                    as: "hierarchy",
                    maxDepth: depth,
                    restrictSearchWithMatch: { type: "parent_of" }
                }
            }
        ]);

        let ancestorIds = [];
        if (relationships.length > 0) {
            // Direct parents
            relationships.forEach(r => ancestorIds.push(r.fromPersonId));

            // Graph parents
            relationships.forEach(r => {
                if (r.hierarchy) {
                    r.hierarchy.forEach(h => ancestorIds.push(h.fromPersonId));
                }
            });
        }

        // Unique IDs
        ancestorIds = [...new Set(ancestorIds.map(id => id.toString()))];

        const people = await Person.find({ _id: { $in: ancestorIds } });

        return success(res, people);
    } catch (err) {
        return error(res, err);
    }
};

// Get Descendants (placeholder for deep traversal)
// Get Descendants (Recursive)
exports.getDescendants = async (req, res) => {
    try {
        const { id } = req.params;
        const depth = parseInt(req.query.depth) || 5;

        // Find children recursively
        // 'parent_of': fromPerson = Parent, toPerson = Child.
        // Start node: fromPersonId = id.
        // Connect to: fromPersonId (Next Parent) -> connectToField toPersonId?
        // NO.
        // Parent (id) -> Relationship (from=id, to=Child)
        // Child becomes Parent in next level?
        // Yes, if we want Child's children.
        // So connectToField (of next) should match connectFromField (of previous).
        // startWith: id.
        // Match relationship where fromPersonId = id.
        // Recursively match relationship where fromPersonId = previous.toPersonId.

        const hierarchy = await Relationship.aggregate([
            {
                $match: {
                    fromPersonId: new mongoose.Types.ObjectId(id),
                    type: "parent_of"
                }
            },
            {
                $graphLookup: {
                    from: "relationships",
                    startWith: "$toPersonId", // The child of the current relationship
                    connectFromField: "toPersonId", // The child becomes the 'from' (parent) in next
                    connectToField: "fromPersonId",
                    as: "descendants",
                    maxDepth: depth,
                    restrictSearchWithMatch: { type: "parent_of" }
                }
            }
        ]);

        let descendantIds = [];
        if (hierarchy.length > 0) {
            hierarchy.forEach(r => {
                descendantIds.push(r.toPersonId);
                if (r.descendants) {
                    r.descendants.forEach(d => descendantIds.push(d.toPersonId));
                }
            });
        }

        descendantIds = [...new Set(descendantIds.map(id => id.toString()))];
        const people = await Person.find({ _id: { $in: descendantIds } });

        return success(res, people);

    } catch (err) {
        return error(res, err);
    }
};
