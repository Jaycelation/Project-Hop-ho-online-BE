const Branch = require("../models/BranchModel");
const mongoose = require("mongoose");

const BRANCH_ROLE_LEVELS = {
    viewer: 1,
    editor: 2,
    owner: 3,
    admin: 99,
};

function normalizeId(value) {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (typeof value === "object") {
        if (value._id) return value._id.toString();
        if (typeof value.toString === "function") return value.toString();
    }
    return String(value);
}

function getBranchRoleForUser(branch, user) {
    if (!branch || !user) return null;
    if (user.role === "admin") return "admin";

    const userId = normalizeId(user._id || user.id);
    if (!userId) return null;

    if (normalizeId(branch.ownerId) === userId) return "owner";

    const member = (branch.members || []).find((m) => normalizeId(m.userId) === userId);
    return member?.roleInBranch || null;
}

function hasBranchRole(branch, user, requiredRole = "viewer") {
    const userRole = getBranchRoleForUser(branch, user);
    if (!userRole) return false;

    const currentLevel = BRANCH_ROLE_LEVELS[userRole] || 0;
    const requiredLevel = BRANCH_ROLE_LEVELS[requiredRole] || BRANCH_ROLE_LEVELS.viewer;
    return currentLevel >= requiredLevel;
}

async function getAccessibleBranchIds(user, requiredRole = "viewer") {
    if (!user) return [];
    if (user.role === "admin") {
        const branches = await Branch.find({}).select("_id").lean();
        return branches.map((b) => b._id.toString());
    }

    const userId = normalizeId(user._id || user.id);
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return [];

    let query;
    if (requiredRole === "viewer") {
        query = { $or: [{ ownerId: userId }, { "members.userId": userId }] };
    } else {
        query = {
            $or: [
                { ownerId: userId },
                { members: { $elemMatch: { userId, roleInBranch: { $in: ["owner", "editor"] } } } },
            ],
        };
    }

    const branches = await Branch.find(query).select("_id").lean();
    return branches.map((b) => b._id.toString());
}

module.exports = {
    BRANCH_ROLE_LEVELS,
    normalizeId,
    getBranchRoleForUser,
    hasBranchRole,
    getAccessibleBranchIds,
};
