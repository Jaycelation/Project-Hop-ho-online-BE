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
// Fix List Persons
// exports.listPersons = async (req, res) => {
//     try {
//         const { branchId, fullName } = req.query;
//         const page = parseInt(req.query.page) || 1;
//         const limit = parseInt(req.query.limit) || 20;

//         let query = {};
//         if (branchId) query.branchId = branchId;
//         if (fullName) query.fullName = { $regex: fullName, $options: "i" };

//         const persons = await Person.find(query)
//             .skip((page - 1) * limit)
//             .limit(limit)
//             .sort({ fullName: 1 });

//         const total = await Person.countDocuments(query);

//         return success(res, persons, { page, limit, total, totalPages: Math.ceil(total / limit) });
//     } catch (err) {
//         return error(res, err);
//     }
// };
// List Persons
exports.listPersons = async (req, res) => {
    try {
        const { branchId, fullName, privacy } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        let query = {};
        if (branchId) query.branchId = branchId;
        if (fullName) query.fullName = { $regex: fullName, $options: "i" };
        
        if (privacy) {
            if (!["public", "internal", "sensitive"].includes(privacy)) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: "INVALID_PRIVACY",
                        message: "Invalid privacy level. Must be public, internal, or sensitive."
                    }
                });
            }
            query.privacy = privacy;
        }

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
// exports.getTree = async (req, res) => {
//     try {
//         const { id } = req.params;

//         const root = await Person.findById(id);
//         if (!root) {
//             return error(res, { code: "PERSON_NOT_FOUND", message: "Person not found" }, 404);
//         }

//         const hasAccess = await securityGuard.checkPrivacy(root, req.user);
//         if (!hasAccess) {
//             return error(
//                 res,
//                 { code: "FORBIDDEN_PRIVATE_RESOURCE", message: "You do not have access to this person" },
//                 403
//             );
//         }

//         // Parents: rel where toPersonId = child, fromPersonId = parent
//         const parentRels = await Relationship.find({ toPersonId: id, type: "parent_of" }).populate("fromPersonId");
//         const parents = parentRels.map(r => r.fromPersonId);

//         // Children: rel where fromPersonId = parent, toPersonId = child
//         const childRels = await Relationship.find({ fromPersonId: id, type: "parent_of" }).populate("toPersonId");
//         const children = childRels.map(r => r.toPersonId);

//         // Spouses
//         const spouseRels = await Relationship.find({
//             type: "spouse_of",
//             $or: [{ fromPersonId: id }, { toPersonId: id }]
//         }).populate("fromPersonId toPersonId");
//         const spouses = spouseRels.map(r => (r.fromPersonId._id.toString() === id ? r.toPersonId : r.fromPersonId));

//         return success(res, { root, parents, children, spouses });
//     } catch (err) {
//         return error(res, err);
//     }
// };
exports.getTree = async (req, res) => {
  try {
    const { id } = req.params;

    const format = String(req.query.format || "nested").toLowerCase();
    const depthRaw = parseInt(req.query.depth, 10);
    const depth = Number.isFinite(depthRaw) ? Math.max(0, Math.min(depthRaw, 10)) : 3;

    const includeSpouses = (() => {
      const v = req.query.includeSpouses;
      if (v === undefined || v === null) return true;
      const s = String(v).toLowerCase();
      return s === "true" || s === "1" || s === "yes" || s === "y";
    })();

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

    // Backward-compatible "flat"
    if (format !== "nested") {
      const parentRels = await Relationship.find({ toPersonId: id, type: "parent_of" }).populate("fromPersonId");
      const parents = parentRels.map((r) => r.fromPersonId);

      const childRels = await Relationship.find({ fromPersonId: id, type: "parent_of" }).populate("toPersonId");
      const children = childRels.map((r) => r.toPersonId);

      const spouseRels = await Relationship.find({
        type: "spouse_of",
        $or: [{ fromPersonId: id }, { toPersonId: id }],
      }).populate("fromPersonId toPersonId");
      const spouses = spouseRels.map((r) => (r.fromPersonId._id.toString() === id ? r.toPersonId : r.fromPersonId));

      return success(res, { root, parents, children, spouses });
    }

    // ===== NESTED TREE =====
    const rootId = root._id.toString();

    const edgesChild = new Map();  // parentId -> Set(childId)
    const edgesParent = new Map(); // childId  -> Set(parentId)
    const allIds = new Set([rootId]);

    // Descendants
    let current = [rootId];
    for (let i = 0; i < depth; i++) {
      if (!current.length) break;

      const rels = await Relationship.find({
        fromPersonId: { $in: current },
        type: "parent_of",
      })
        .select("fromPersonId toPersonId")
        .lean();

      const next = [];
      for (const r of rels) {
        const fromId = r.fromPersonId.toString();
        const toId = r.toPersonId.toString();

        if (!edgesChild.has(fromId)) edgesChild.set(fromId, new Set());
        edgesChild.get(fromId).add(toId);

        if (!allIds.has(toId)) {
          allIds.add(toId);
          next.push(toId);
        }
      }
      current = next;
    }

    // Ancestors
    current = [rootId];
    for (let i = 0; i < depth; i++) {
      if (!current.length) break;

      const rels = await Relationship.find({
        toPersonId: { $in: current },
        type: "parent_of",
      })
        .select("fromPersonId toPersonId")
        .lean();

      const next = [];
      for (const r of rels) {
        const parentId = r.fromPersonId.toString();
        const childId = r.toPersonId.toString();

        if (!edgesParent.has(childId)) edgesParent.set(childId, new Set());
        edgesParent.get(childId).add(parentId);

        if (!allIds.has(parentId)) {
          allIds.add(parentId);
          next.push(parentId);
        }
      }
      current = next;
    }

    // Spouses
    const spouseMap = new Map(); // personId -> Set(spouseId)
    if (includeSpouses) {
      const idsArr = Array.from(allIds);
      const rels = await Relationship.find({
        type: "spouse_of",
        $or: [{ fromPersonId: { $in: idsArr } }, { toPersonId: { $in: idsArr } }],
      })
        .select("fromPersonId toPersonId")
        .lean();

      for (const r of rels) {
        const a = r.fromPersonId.toString();
        const b = r.toPersonId.toString();

        if (!spouseMap.has(a)) spouseMap.set(a, new Set());
        if (!spouseMap.has(b)) spouseMap.set(b, new Set());
        spouseMap.get(a).add(b);
        spouseMap.get(b).add(a);

        allIds.add(a);
        allIds.add(b);
      }
    }

    // Fetch persons + privacy filter
    const persons = await Person.find({ _id: { $in: Array.from(allIds) } });
    const personById = new Map(persons.map((p) => [p._id.toString(), p]));

    const allowed = new Set();
    for (const [pid, p] of personById.entries()) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await securityGuard.checkPrivacy(p, req.user);
      if (ok) allowed.add(pid);
    }
    if (!allowed.has(rootId)) {
      return error(
        res,
        { code: "FORBIDDEN_PRIVATE_RESOURCE", message: "You do not have access to this person" },
        403
      );
    }

    const filterSetMap = (map) => {
      for (const [k, set] of map.entries()) {
        if (!allowed.has(k)) {
          map.delete(k);
          continue;
        }
        for (const v of Array.from(set)) {
          if (!allowed.has(v)) set.delete(v);
        }
        if (set.size === 0) map.delete(k);
      }
    };
    filterSetMap(edgesChild);
    filterSetMap(edgesParent);
    filterSetMap(spouseMap);

    const toPlainPerson = (pid) => {
      const doc = personById.get(pid);
      return doc ? doc.toObject() : null;
    };

    const buildDescTree = (pid, remain, path) => {
      if (!allowed.has(pid)) return null;
      const me = toPlainPerson(pid);
      if (!me) return null;

      me.spouses = includeSpouses
        ? Array.from(spouseMap.get(pid) || [])
            .filter((sid) => allowed.has(sid))
            .map((sid) => toPlainPerson(sid))
            .filter(Boolean)
        : [];

      me.children = [];
      if (remain <= 0) return me;

      const childIds = Array.from(edgesChild.get(pid) || []);
      for (const cid of childIds) {
        if (path.has(cid)) continue;
        const nextPath = new Set(path);
        nextPath.add(cid);
        const childNode = buildDescTree(cid, remain - 1, nextPath);
        if (childNode) me.children.push(childNode);
      }
      return me;
    };

    const buildAncTree = (pid, remain, path) => {
      if (!allowed.has(pid)) return null;
      const me = toPlainPerson(pid);
      if (!me) return null;

      me.spouses = includeSpouses
        ? Array.from(spouseMap.get(pid) || [])
            .filter((sid) => allowed.has(sid))
            .map((sid) => toPlainPerson(sid))
            .filter(Boolean)
        : [];

      me.parents = [];
      if (remain <= 0) return me;

      const parentIds = Array.from(edgesParent.get(pid) || []);
      for (const parId of parentIds) {
        if (path.has(parId)) continue;
        const nextPath = new Set(path);
        nextPath.add(parId);
        const parentNode = buildAncTree(parId, remain - 1, nextPath);
        if (parentNode) me.parents.push(parentNode);
      }
      return me;
    };

    const rootNode = buildDescTree(rootId, depth, new Set([rootId])) || root.toObject();
    const rootAnc = buildAncTree(rootId, depth, new Set([rootId]));
    rootNode.parents = rootAnc?.parents || [];

    rootNode.spouses = rootNode.spouses || [];
    rootNode.children = rootNode.children || [];
    rootNode.parents = rootNode.parents || [];

    return success(res, { root: rootNode });
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
