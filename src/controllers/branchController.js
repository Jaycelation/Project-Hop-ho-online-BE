const Branch = require("../models/BranchModel");
const User = require("../models/UserModel"); // To verify user existence
const { success, error } = require("../utils/responseHandler");

// List branches (MEMBER+)
// Returns branches where user is owner, or is a member, or if user is ADMIN returns all? 
// Requirements say MEMBER+. Usually means "My branches".
exports.listBranches = async (req, res) => {
    try {
        const { role, id } = req.user;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        let query = {};
        if (role === "admin") {
            // Admin sees all? Or just their own? Usually Admin manages all.
            // But for a list endpoint, maybe standard filtering.
            // Let's assume Admin sees all for now, or we can filter by query params.
        } else {
            // Members see branches they are part of or own
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
            members: [] // Start with no extra members
        });

        return success(res, branch, null, 201);
    } catch (err) {
        return error(res, err);
    }
};

// Get Branch Details (MEMBER+)
// Check access: Owner, Member, or Admin
exports.getBranch = async (req, res) => {
    try {
        const branch = await Branch.findById(req.params.id).populate("ownerId", "fullName email");

        if (!branch) {
            return error(res, { code: "BRANCH_NOT_FOUND", message: "Branch not found" }, 404);
        }

        const isOwner = branch.ownerId.toString() === req.user.id;
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

// Update Branch (ADMIN/EDITOR - typically Owner too)
exports.updateBranch = async (req, res) => {
    try {
        // Permission check is usually done via middleware or here. 
        // Requirements say ADMIN/EDITOR. I will assume Owner also should be allowed if they are EDITOR?
        // Let's stick to requirements: ADMIN/EDITOR endpoint scope.
        // We will assume the verifyToken + ensureRole middleware handles the "Editor+" part, 
        // but we might want to check ownership if not admin?
        // Req: "Auth ADMIN/EDITOR". Access control is strict.

        const branch = await Branch.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!branch) {
            return error(res, { code: "BRANCH_NOT_FOUND", message: "Branch not found" }, 404);
        }

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

        // Check if user exists
        const userToAdd = await User.findById(userId);
        if (!userToAdd) {
            return error(res, { code: "USER_NOT_FOUND", message: "User to add not found" }, 404);
        }

        // Check if already member
        const exists = branch.members.some(m => m.userId.toString() === userId);
        if (exists) {
            return error(res, { code: "CONFLICT_MEMBER_EXISTS", message: "User already in branch" }, 409);
        }

        branch.members.push({ userId, roleInBranch: roleInBranch || "viewer" });
        await branch.save();

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

        branch.members = branch.members.filter(m => m.userId.toString() !== userId);
        await branch.save();

        return success(res, branch);
    } catch (err) {
        return error(res, err);
    }
};

// List Members (ADMIN/EDITOR) -> Actually MEMBER should probably see members too?
// Req: "GET /api/branches/:id/members Auth ADMIN/EDITOR"
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
