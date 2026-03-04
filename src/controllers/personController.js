const Person = require("../models/PersonModel");
const Relationship = require("../models/RelationshipModel");
const Event = require("../models/EventModel");
const Media = require("../models/MediaModel");
const fs = require("fs");
const mongoose = require("mongoose");
const { success, error } = require("../utils/responseHandler");
const logAudit = require("../utils/auditLogger");
const securityGuard = require("../utils/securityGuard");
const { filterPersonsByPrivacy } = require("../utils/privacyFilter");
const { appendLunarDates } = require("../utils/dateHelpers");
const { computeKinship } = require("../utils/kinshipHelpers");

// Create Person
exports.createPerson = async (req, res) => {
  try {
    const {
      branchId, fullName, otherNames,
      gender, dateOfBirth, dateOfDeath,
      lunarDateOfBirth, lunarDateOfDeath,
      isAlive, birthOrder,
      subBranch, occupation, hometown, currentAddress,
      phone, address, privacy, note, generation,
    } = req.body;

    const person = await Person.create({
      branchId, fullName, otherNames: otherNames || "",
      gender, dateOfBirth, dateOfDeath,
      lunarDateOfBirth: lunarDateOfBirth || "",
      lunarDateOfDeath: lunarDateOfDeath || "",
      isAlive: isAlive !== undefined ? isAlive : true,
      birthOrder: birthOrder ?? null,
      subBranch: subBranch || "",
      occupation: occupation || "",
      hometown: hometown || "",
      currentAddress: currentAddress || "",
      phone: phone || "",
      address: address || "",
      privacy, note, generation,
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

// Get Person Details (Phase 1: enriched with lunar calendar & zodiac fields)
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

    // Phase 1: Append lunar date & zodiac virtual fields without touching the DB doc
    const enriched = appendLunarDates(person);
    return success(res, enriched);
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
    if (branchId) {
      if (!mongoose.Types.ObjectId.isValid(branchId)) {
        return res.status(400).json({
          success: false,
          error: { code: "INVALID_BRANCH_ID", message: "Mã chi nhánh không hợp lệ" }
        });
      }
      query.branchId = branchId;
    }
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

    const safePersons = await filterPersonsByPrivacy(persons, securityGuard, req.user);

    const total = await Person.countDocuments(query);

    return success(res, safePersons, { page, limit, total, totalPages: Math.ceil(total / limit) });
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

    // ── Guard 1: validate id format immediately ────────────────────────────
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return error(res, { code: "INVALID_OBJECT_ID", message: `'${id}' không phải ObjectId hợp lệ` }, 400);
    }

    const format = String(req.query.format || "nested").toLowerCase();
    const depthRaw = parseInt(req.query.depth) || 5;
    const depth = Number.isFinite(depthRaw) ? Math.max(1, Math.min(depthRaw, 50)) : 5;
    const maxDepth = Math.max(0, depth - 1);

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
        if (!r.fromPersonId || !r.toPersonId) continue; // Safe check for orphaned relationship data
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

    // ── CRITICAL FIX: Also populate edgesParent for ALL descendants ──────────
    // The ancestor loop above only maps childId→parentId going UPWARD from root.
    // buildDescTree needs edgesParent for each CHILD in the tree to determine
    // which of the father's spouses is a co-parent (for multi-spouse grouping).
    // Without this, matchedSpouseId is always undefined → all children go to solo.
    {
      const allDescIds = [];
      for (const set of edgesChild.values()) {
        for (const cid of set) allDescIds.push(cid);
      }
      if (allDescIds.length > 0) {
        const coParentRels = await Relationship.find({
          toPersonId: { $in: allDescIds },
          type: "parent_of",
        }).select("fromPersonId toPersonId").lean();

        for (const r of coParentRels) {
          if (!r.fromPersonId || !r.toPersonId) continue;
          const pId = r.fromPersonId.toString();
          const cId = r.toPersonId.toString();
          if (!edgesParent.has(cId)) edgesParent.set(cId, new Set());
          edgesParent.get(cId).add(pId);
          allIds.add(pId); // co-parent might be a new person not yet in allIds
        }
      }
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
        if (!r.fromPersonId || !r.toPersonId) continue;
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
        if (!r.fromPersonId || !r.toPersonId) continue;
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

    // ── PERF FIX: Branch-cache privacy check (avoids N per-person DB calls) ──
    // All persons in one tree usually share ONE branch.
    // Strategy: check branch access once per unique branchId, cache, then apply.
    // ── Guard 2: strip any invalid IDs gathered from relationship edges ──────
    const validAllIds = Array.from(allIds).filter((oid) => mongoose.Types.ObjectId.isValid(oid));
    // Use .lean() to get PLAIN JS objects — Mongoose documents have internal
    // circular refs ($__parent etc.) that crash JSON.stringify at large depths.
    const persons = await Person.find({ _id: { $in: validAllIds } }).lean();
    const personById = new Map(persons.map((p) => [p._id.toString(), p]));

    // Build set of unique branchIds that appear in the tree
    const uniqueBranchIds = new Set(
      persons.map((p) => p.branchId && p.branchId.toString()).filter(Boolean)
    );

    // Check branch-level access once per branchId
    const branchAccessCache = new Map(); // branchId → boolean
    await Promise.all(
      Array.from(uniqueBranchIds).map(async (bid) => {
        // Fabricate a minimal resource object with that branchId and privacy "internal"
        // to trigger the branch-member check inside securityGuard
        const ok = await securityGuard.checkPrivacy({ privacy: "internal", branchId: bid }, req.user);
        branchAccessCache.set(bid, ok);
      })
    );

    // Determine allowed set for each person using the cached branch result
    const allowed = new Set();
    for (const [pid, p] of personById.entries()) {
      if (p.privacy === "public") {
        allowed.add(pid);
      } else if (!req.user) {
        // Not authenticated — skip non-public
      } else if (req.user.role === "admin") {
        allowed.add(pid); // Global admin sees everything
      } else if (p.privacy === "internal") {
        const bid = p.branchId && p.branchId.toString();
        if (bid && branchAccessCache.get(bid)) allowed.add(pid);
      } else if (p.privacy === "sensitive") {
        if (req.user.role === "editor") {
          allowed.add(pid);
        } else {
          const bid = p.branchId && p.branchId.toString();
          if (bid && branchAccessCache.get(bid)) allowed.add(pid);
        }
      }
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

    const includeSiblings = (() => {
      const v = req.query.includeSiblings;
      if (v === undefined || v === null) return false;
      const s = String(v).toLowerCase();
      return s === "true" || s === "1" || s === "yes" || s === "y";
    })();

    // ── sanitize: extract only safe scalar fields from a lean person object ──
    // This is the SINGLE function that touches raw DB data, guaranteeing
    // the returned object has no circular refs, Mongoose internals, or
    // nested sub-documents that haven't been explicitly requested.
    const sanitize = (raw) => ({
      _id: raw._id,
      fullName: raw.fullName || "",
      otherNames: raw.otherNames || "",
      gender: raw.gender || "",
      dateOfBirth: raw.dateOfBirth || null,
      dateOfDeath: raw.dateOfDeath || null,
      lunarDateOfBirth: raw.lunarDateOfBirth || "",
      lunarDateOfDeath: raw.lunarDateOfDeath || "",
      birthYear: raw.birthYear ?? null,
      deathYear: raw.deathYear ?? null,
      isAlive: raw.isAlive ?? true,
      birthOrder: raw.birthOrder ?? null,
      generation: raw.generation ?? null,
      subBranch: raw.subBranch || "",
      occupation: raw.occupation || "",
      hometown: raw.hometown || "",
      currentAddress: raw.currentAddress || "",
      privacy: raw.privacy || "public",
      note: raw.note || "",
      branchId: raw.branchId || null,
    });

    // ── toSlimPerson: card-only (no nested arrays) — used for spouse cards
    //    kept small intentionally to prevent exponential JSON growth
    const toSlimPerson = (pid) => {
      const raw = personById.get(pid);
      if (!raw) return null;
      return sanitize(raw);
    };

    // ── toPlainPerson: node shell with empty array slots (filled by caller)
    const toPlainPerson = (pid) => {
      const raw = personById.get(pid);
      if (!raw) return null;
      const obj = sanitize(raw);
      obj.spouses = [];
      obj.marriages = [];
      // No flat children[] here — data lives exclusively in marriages[].children
      return obj;
    };

    let siblings = [];
    if (includeSiblings) {
      const parentIds = Array.from(edgesParent.get(rootId) || []);
      const sibIds = new Set();
      for (const pid of parentIds) {
        const kids = Array.from(edgesChild.get(pid) || []);
        for (const kidId of kids) {
          if (kidId !== rootId) sibIds.add(kidId);
        }
      }
      siblings = Array.from(sibIds)
        .filter((sid) => allowed.has(sid))
        .map((sid) => toPlainPerson(sid))
        .filter(Boolean);
    }


    // ── Circuit-breaker: hard cap on total nodes to prevent huge JSON ───────────
    const MAX_NODES = 3000;
    let nodeCounter = 0;

    const buildDescTree = (pid, remain, path) => {
      if (!allowed.has(pid)) return null;

      // Hard cap — emit a sentinel stub so FE knows data was cut
      if (nodeCounter >= MAX_NODES) {
        return { _id: pid, truncated: true };
      }
      nodeCounter++;

      const me = toPlainPerson(pid);
      if (!me) return null;

      const mySpouseIds = includeSpouses
        ? Array.from(spouseMap.get(pid) || []).filter((sid) => allowed.has(sid))
        : [];

      // Slim spouse cards — no nested sub-arrays (prevents exponential growth)
      me.spouses = mySpouseIds.map((sid) => toSlimPerson(sid)).filter(Boolean);
      me.marriages = [];
      // childrenIds: flat list of direct child IDs (backwards compat, avoids duplication)
      me.childrenIds = [];

      if (remain <= 0) return me;

      const childIds = Array.from(edgesChild.get(pid) || []);

      // Group children by co-parent (spouse)
      const coParentMap = new Map();
      coParentMap.set("none", []);
      for (const sid of mySpouseIds) coParentMap.set(sid, []);

      for (const cid of childIds) {
        if (path.has(cid) || !allowed.has(cid)) continue;
        me.childrenIds.push(cid);  // track flat IDs for backwards compat
        const childParentIds = Array.from(edgesParent.get(cid) || []);
        const matchedSpouseId = mySpouseIds.find((sid) => childParentIds.includes(sid));
        if (matchedSpouseId) {
          coParentMap.get(matchedSpouseId).push(cid);
        } else {
          coParentMap.get("none").push(cid);
        }
      }

      const buildChildren = (cidList) =>
        cidList.map((cid) => {
          const nextPath = new Set(path);
          nextPath.add(cid);
          return buildDescTree(cid, remain - 1, nextPath);
        }).filter(Boolean);

      // Marriages with a known co-parent
      for (const sid of mySpouseIds) {
        const groupChildIds = coParentMap.get(sid) || [];
        me.marriages.push({
          spouse: toSlimPerson(sid),
          children: buildChildren(groupChildIds),   // nested subtrees HERE only
        });
      }

      // Solo children (unknown/missing co-parent)
      const soloChildIds = coParentMap.get("none") || [];
      if (soloChildIds.length > 0) {
        me.marriages.push({ spouse: null, children: buildChildren(soloChildIds) });
      }

      // REMOVED: me.children = me.marriages.flatMap(m => m.children)
      // That line was DOUBLING the entire subtree in the JSON payload.
      // FE must read marriages[].children instead of the flat children array.

      return me;
    };

    const buildAncTree = (pid, remain, path) => {
      if (!allowed.has(pid)) return null;
      const me = toPlainPerson(pid);
      if (!me) return null;

      // Slim spouse cards — circular-ref-safe (no sub-arrays)
      me.spouses = includeSpouses
        ? Array.from(spouseMap.get(pid) || [])
          .filter((sid) => allowed.has(sid))
          .map((sid) => toSlimPerson(sid))
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

    // Build final root — use sanitized lean fallback if build returns null
    const rootLean = personById.get(rootId);
    const rootNode = buildDescTree(rootId, depth, new Set([rootId]))
      || (rootLean ? sanitize(rootLean) : {});
    const rootAnc = buildAncTree(rootId, depth, new Set([rootId]));
    rootNode.parents = rootAnc?.parents || [];
    rootNode.spouses = rootNode.spouses || [];
    rootNode.marriages = rootNode.marriages || [];
    rootNode.childrenIds = rootNode.childrenIds || [];
    rootNode.siblings = siblings || [];
    rootNode._truncated = nodeCounter >= MAX_NODES; // FE can show "tree truncated" banner

    return success(res, { root: rootNode });
  } catch (err) {
    if (err instanceof Error) {
      return res.status(500).json({ success: false, error: { message: err.message, stack: err.stack, custom: true } });
    }
    return error(res, err);
  }
};


// Get Ancestors (placeholder for deep traversal)
// Get Ancestors (Recurisve)
exports.getAncestors = async (req, res) => {
  try {
    const { id } = req.params;
    const depthRaw = parseInt(req.query.depth) || 5;
    const depth = Number.isFinite(depthRaw) ? Math.max(1, Math.min(depthRaw, 10)) : 5; // Default depth 5
    const maxDepth = Math.max(0, depth - 1);
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
          maxDepth: maxDepth,
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
    const safePeople = await filterPersonsByPrivacy(people, securityGuard, req.user);
    return success(res, safePeople);
  } catch (err) {
    return error(res, err);
  }
};

// Get Descendants (placeholder for deep traversal)
// Get Descendants (Recursive)
exports.getDescendants = async (req, res) => {
  try {
    const { id } = req.params;
    const depthRaw = parseInt(req.query.depth) || 5;
    const depth = Number.isFinite(depthRaw) ? Math.max(1, Math.min(depthRaw, 10)) : 5;
    const maxDepth = Math.max(0, depth - 1);

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
          maxDepth: maxDepth,
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
    const safePeople = await filterPersonsByPrivacy(people, securityGuard, req.user);
    return success(res, safePeople);

  } catch (err) {
    return error(res, err);
  }
};

// ── Phase 2: Kinship Calculator ───────────────────────────────────────────────
// GET /api/persons/:id/kinship/:targetId
exports.getKinship = async (req, res) => {
  try {
    const { id, targetId } = req.params;

    const [personA, personB] = await Promise.all([
      Person.findById(id),
      Person.findById(targetId),
    ]);

    if (!personA) return error(res, { code: "PERSON_NOT_FOUND", message: "Nguồn không tồn tại" }, 404);
    if (!personB) return error(res, { code: "PERSON_NOT_FOUND", message: "Mục tiêu không tồn tại" }, 404);

    // Both persons must be in the same branch
    if (String(personA.branchId) !== String(personB.branchId)) {
      return error(res, { code: "DIFFERENT_BRANCH", message: "Hai người thuộc hai chi nhánh khác nhau" }, 422);
    }

    const branchId = personA.branchId;

    // Load all persons + relationships for the shared branch
    const [allPersons, allRelationships] = await Promise.all([
      Person.find({ branchId }).lean(),
      Relationship.find({ branchId }).lean(),
    ]);

    const result = computeKinship(personA, personB, allPersons, allRelationships);

    if (!result) {
      return error(res, { code: "SAME_PERSON", message: "Không thể tính xưng hô với chính mình" }, 422);
    }

    return success(res, {
      personA: { _id: personA._id, fullName: personA.fullName, gender: personA.gender },
      personB: { _id: personB._id, fullName: personB.fullName, gender: personB.gender },
      kinship: result,
    });
  } catch (err) {
    return error(res, err);
  }
};
