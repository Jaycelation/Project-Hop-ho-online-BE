const Branch = require("../models/BranchModel");
const User = require("../models/UserModel");
const { success, error } = require("../utils/responseHandler");
const logAudit = require("../utils/auditLogger");

// List branches (MEMBER+)
exports.listBranches = async (req, res) => {
    try {
        const { role, id } = req.user;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        let query = {};
        if (role === "admin") {
            // Admin sees all
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

// Create Branch (ADMIN/EDITOR)
exports.createBranch = async (req, res) => {
    try {
        const { name, description } = req.body;

        const branch = await Branch.create({
            name,
            description,
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

        return success(res, branch, null, 201);
    } catch (err) {
        return error(res, err);
    }
};

// Get Branch Details (MEMBER+)
exports.getBranch = async (req, res) => {
    try {
        const branch = await Branch.findById(req.params.id).populate("ownerId", "fullName email");

        if (!branch) {
            return error(res, { code: "BRANCH_NOT_FOUND", message: "Branch not found" }, 404);
        }

        const isOwner = branch.ownerId._id.toString() === req.user.id;
        const isMember = branch.members.some(m => m.userId.toString() === req.user.id);
        const isAdmin = req.user.role === "admin";

        if (!isOwner && !isMember && !isAdmin) {
            return error(res, { code: "FORBIDDEN_BRANCH_ACCESS", message: "Access denied to this branch" }, 403);
        }

        return success(res, branch);
    } catch (err) {
        return error(res, err);
    }
};

// Update Branch (ADMIN/EDITOR)
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

// Delete Branch (ADMIN)
exports.deleteBranch = async (req, res) => {
    try {
        const branch = await Branch.findByIdAndDelete(req.params.id);
        if (!branch) {
            return error(res, { code: "BRANCH_NOT_FOUND", message: "Branch not found" }, 404);
        }

        await logAudit({
            actorId: req.user.id,
            action: "DELETE",
            entityType: "Branch",
            entityId: branch._id,
            branchId: branch._id,
            before: branch
        }, req);

        return success(res, { message: "Branch deleted" });
    } catch (err) {
        return error(res, err);
    }
};

// Add Member (ADMIN/EDITOR)
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

// Remove Member (ADMIN/EDITOR)
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

// List Members (ADMIN/EDITOR)
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
