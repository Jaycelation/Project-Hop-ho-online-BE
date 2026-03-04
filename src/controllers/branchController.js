const Branch = require("../models/BranchModel");
const Person = require("../models/PersonModel");
const Relationship = require("../models/RelationshipModel");
const Event = require("../models/EventModel");
const Media = require("../models/MediaModel");
const User = require("../models/UserModel");
const mongoose = require("mongoose");
const fs = require("fs");
const fsPromises = require("fs").promises; // async file ops
const { success, error } = require("../utils/responseHandler");
const logAudit = require("../utils/auditLogger");

// ─── List Branches ─────────────────────────────────────────────────────────────
exports.listBranches = async (req, res) => {
    try {
        const { role, id } = req.user;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        let query = {};
        if (role === "admin") {
            // Admin sees all branches
        } else {
            query = {
                $or: [
                    { ownerId: id },
                    { "members.userId": id }
                ]
            };
        }

        const branches = await Branch.find(query)
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 })
            .populate("ownerId", "fullName email");

        const total = await Branch.countDocuments(query);

        return success(res, branches, {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        });
    } catch (err) {
        return error(res, err);
    }
};


// ─── Create Branch (ADMIN / global EDITOR) ────────────────────────────────────
// Supports optional atomic root person creation via Mongo session.
// Body: { name, description, root?: { fullName, gender, dateOfBirth?, birthYear?, hometown?, note? } }
exports.createBranch = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const { name, description, root } = req.body;
        let branch, rootPerson;

        if (root && root.fullName) {
            // ── ATOMIC path: branch + root person in one transaction ──────────────
            session.startTransaction();

            // 1. Create branch (rootPersonId set after person is created)
            [branch] = await Branch.create(
                [{ name, description: description || "", ownerId: req.user.id, members: [] }],
                { session }
            );

            // 2. Create root person belonging to this branch
            [rootPerson] = await Person.create(
                [{
                    branchId: branch._id,
                    fullName: root.fullName,
                    gender: root.gender || "male",
                    dateOfBirth: root.dateOfBirth || "",
                    birthYear: root.birthYear || null,
                    hometown: root.hometown || "",
                    note: root.note || "",
                    privacy: "internal",
                    isAlive: true,
                    generation: 1,
                    createdBy: req.user.id,
                }],
                { session }
            );

            // 3. Link rootPersonId back to branch
            branch.rootPersonId = rootPerson._id;
            await branch.save({ session });

            await session.commitTransaction();

            await logAudit({
                actorId: req.user.id,
                action: "CREATE",
                entityType: "Branch",
                entityId: branch._id,
                branchId: branch._id,
                after: { branch, rootPerson }
            }, req);

            return success(res, { branch, rootPerson }, null, 201);

        } else {
            // ── Simple path: branch only (backwards compatible) ───────────────────
            branch = await Branch.create({
                name,
                description: description || "",
                ownerId: req.user.id,
                members: []
            });

            await logAudit({
                actorId: req.user.id,
                action: "CREATE",
                entityType: "Branch",
                entityId: branch._id,
                branchId: branch._id,
                after: branch
            }, req);

            return success(res, { branch, rootPerson: null }, null, 201);
        }
    } catch (err) {
        if (session.inTransaction()) await session.abortTransaction();
        return error(res, err);
    } finally {
        session.endSession();
    }
};

// ─── Set Root Person (PATCH /api/branches/:id/root) ───────────────────────────
exports.setRootPerson = async (req, res) => {
    try {
        const { rootPersonId } = req.body;
        if (!rootPersonId || !mongoose.Types.ObjectId.isValid(rootPersonId)) {
            return error(res, { code: "INVALID_OBJECT_ID", message: "rootPersonId không hợp lệ" }, 400);
        }

        const branch = await Branch.findById(req.params.id);
        if (!branch) return error(res, { code: "BRANCH_NOT_FOUND", message: "Branch not found" }, 404);

        const person = await Person.findById(rootPersonId);
        if (!person) return error(res, { code: "PERSON_NOT_FOUND", message: "Person not found" }, 404);
        if (person.branchId.toString() !== branch._id.toString()) {
            return error(res, { code: "PERSON_NOT_IN_BRANCH", message: "Person không thuộc branch này" }, 400);
        }

        branch.rootPersonId = rootPersonId;
        await branch.save();

        await logAudit({
            actorId: req.user.id,
            action: "SET_ROOT",
            entityType: "Branch",
            entityId: branch._id,
            branchId: branch._id,
            after: { rootPersonId }
        }, req);

        return success(res, branch);
    } catch (err) {
        return error(res, err);
    }
};


// ─── Get Branch Details ────────────────────────────────────────────────────────
exports.getBranch = async (req, res) => {
    try {
        const branch = await Branch.findById(req.params.id).populate("ownerId", "fullName email");

        if (!branch) {
            return error(res, { code: "BRANCH_NOT_FOUND", message: "Branch not found" }, 404);
        }

        // FIX: safely handle both req.user.id (string) and req.user._id (ObjectId)
        const uid = req.user.id || (req.user._id && req.user._id.toString());
        // FIX: ownerId may be populated (has ._id) or a raw ObjectId reference
        const isOwner = branch.ownerId._id
            ? branch.ownerId._id.toString() === uid
            : branch.ownerId.toString() === uid;
        const isMember = branch.members.some(m => m.userId.toString() === uid);
        const isAdmin = req.user.role === "admin";

        if (!isOwner && !isMember && !isAdmin) {
            return error(res, { code: "FORBIDDEN_BRANCH_ACCESS", message: "Access denied to this branch" }, 403);
        }

        return success(res, branch);
    } catch (err) {
        return error(res, err);
    }
};

// ─── Update Branch ─────────────────────────────────────────────────────────────
exports.updateBranch = async (req, res) => {
    try {
        const originalBranch = await Branch.findById(req.params.id);
        if (!originalBranch) {
            return error(res, { code: "BRANCH_NOT_FOUND", message: "Branch not found" }, 404);
        }

        // Only allow safe fields — prevent changing ownerId or members via this endpoint
        const { name, description } = req.body;
        const updateFields = {};
        if (name !== undefined) updateFields.name = name;
        if (description !== undefined) updateFields.description = description;

        const branch = await Branch.findByIdAndUpdate(
            req.params.id,
            updateFields,
            { new: true, runValidators: true }
        );

        await logAudit({
            actorId: req.user.id,
            action: "UPDATE",
            entityType: "Branch",
            entityId: branch._id,
            branchId: branch._id,
            before: originalBranch,
            after: branch
        }, req);

        return success(res, branch);
    } catch (err) {
        return error(res, err);
    }
};

// ─── Delete Branch (ADMIN only) — cascades all related data ───────────────────
exports.deleteBranch = async (req, res) => {
    try {
        const branchId = req.params.id;

        const branch = await Branch.findById(branchId);
        if (!branch) {
            return error(res, { code: "BRANCH_NOT_FOUND", message: "Branch not found" }, 404);
        }

        // ── Cascade Step 1: Delete Relationships ──────────────────────────────
        await Relationship.deleteMany({ branchId });

        // ── Cascade Step 2: Delete Media (and physical files) ──────────────
        const mediaList = await Media.find({ branchId });
        // FIX: use async Promise.all instead of sync for-loop (no event-loop blocking)
        await Promise.all(mediaList.map(async (m) => {
            if (m.storagePath) {
                try { await fsPromises.unlink(m.storagePath); } catch (_) { /* ignore missing files */ }
            }
        }));
        await Media.deleteMany({ branchId });

        // ── Cascade Step 3: Delete Events ─────────────────────────────────────
        await Event.deleteMany({ branchId });

        // ── Cascade Step 4: Delete Persons ────────────────────────────────────
        await Person.deleteMany({ branchId });

        // ── Finally: Delete the Branch itself ─────────────────────────────────
        await Branch.findByIdAndDelete(branchId);

        await logAudit({
            actorId: req.user.id,
            action: "DELETE",
            entityType: "Branch",
            entityId: branch._id,
            branchId: branch._id,
            before: branch
        }, req);

        return success(res, { message: "Branch and all related data deleted" });
    } catch (err) {
        return error(res, err);
    }
};

// ─── Add Member (ADMIN / branch owner or editor) ──────────────────────────────
exports.addMember = async (req, res) => {
    try {
        const { userId, roleInBranch } = req.body;
        const branchId = req.params.id;

        const branch = await Branch.findById(branchId);
        if (!branch) {
            return error(res, { code: "BRANCH_NOT_FOUND", message: "Branch not found" }, 404);
        }

        const userToAdd = await User.findById(userId);
        if (!userToAdd) {
            return error(res, { code: "USER_NOT_FOUND", message: "User to add not found" }, 404);
        }

        const exists = branch.members.some(m => m.userId.toString() === userId);
        if (exists) {
            return error(res, { code: "CONFLICT_MEMBER_EXISTS", message: "User already in branch" }, 409);
        }

        branch.members.push({ userId, roleInBranch: roleInBranch || "viewer" });
        await branch.save();

        await logAudit({
            actorId: req.user.id,
            action: "ADD_MEMBER",
            entityType: "Branch",
            entityId: branch._id,
            branchId: branch._id,
            after: { addedUserId: userId, roleInBranch: roleInBranch || "viewer" }
        }, req);

        return success(res, branch);
    } catch (err) {
        return error(res, err);
    }
};

// ─── Remove Member ─────────────────────────────────────────────────────────────
exports.removeMember = async (req, res) => {
    try {
        const { userId } = req.params;
        const branchId = req.params.id;

        const branch = await Branch.findById(branchId);
        if (!branch) {
            return error(res, { code: "BRANCH_NOT_FOUND", message: "Branch not found" }, 404);
        }

        const removedMember = branch.members.find(m => m.userId.toString() === userId);
        branch.members = branch.members.filter(m => m.userId.toString() !== userId);
        await branch.save();

        await logAudit({
            actorId: req.user.id,
            action: "REMOVE_MEMBER",
            entityType: "Branch",
            entityId: branch._id,
            branchId: branch._id,
            before: { removedUserId: userId, member: removedMember }
        }, req);

        return success(res, branch);
    } catch (err) {
        return error(res, err);
    }
};

// ─── List Members ──────────────────────────────────────────────────────────────
exports.listMembers = async (req, res) => {
    try {
        const branch = await Branch.findById(req.params.id).populate("members.userId", "fullName email");
        if (!branch) {
            return error(res, { code: "BRANCH_NOT_FOUND", message: "Branch not found" }, 404);
        }
        return success(res, branch.members);
    } catch (err) {
        return error(res, err);
    }
};
