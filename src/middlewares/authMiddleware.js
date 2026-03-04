const jwt = require("jsonwebtoken");
const User = require("../models/UserModel");
const Branch = require("../models/BranchModel");
const { error } = require("../utils/responseHandler");

// ─── Global token verification ────────────────────────────────────────────────
const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return error(res, { code: "AUTH_MISSING_TOKEN", message: "No token provided" }, 401);
        }

        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");

        const user = await User.findById(decoded.id).select("-passwordHash -refreshToken");
        if (!user) {
            return error(res, { code: "AUTH_USER_NOT_FOUND", message: "User not found" }, 401);
        }

        if (user.isBanned) {
            return error(res, { code: "AUTH_USER_BANNED", message: "User is banned" }, 403);
        }

        req.user = user;
        next();
    } catch (err) {
        if (err.name === "TokenExpiredError") {
            return error(res, { code: "AUTH_TOKEN_EXPIRED", message: "Token expired" }, 401);
        }
        return error(res, { code: "AUTH_INVALID_TOKEN", message: "Invalid token" }, 401);
    }
};

// ─── Global role check (admin, editor, member, guest) ─────────────────────────
const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return error(res, { code: "FORBIDDEN_INSUFFICIENT_ROLE", message: "Insufficient permissions" }, 403);
        }
        next();
    };
};

// ─── Branch-level role check ───────────────────────────────────────────────────
// Branch roles hierarchy: owner > editor > viewer
// requiredBranchRole: "owner" | "editor" | "viewer"
//
// Reads branchId from (in priority order):
//   1. req.params.branchId
//   2. req.body.branchId
//   3. req.query.branchId
//
// Global admin always passes. Branch owner satisfies all branch roles.
// Branch editor satisfies "editor" and "viewer".
// Branch viewer satisfies only "viewer".
const BRANCH_ROLE_HIERARCHY = { owner: 3, editor: 2, viewer: 1 };

const authorizeBranchAccess = (requiredBranchRole) => {
    return async (req, res, next) => {
        try {
            // Global admin bypasses all branch checks
            if (req.user && req.user.role === "admin") {
                return next();
            }

            const branchId =
                req.params.branchId ||
                req.body.branchId ||
                req.query.branchId;

            if (!branchId) {
                // No branchId provided — cannot validate branch access
                return error(res, { code: "FORBIDDEN_BRANCH_ACCESS", message: "branchId is required for this operation" }, 403);
            }

            const branch = await Branch.findById(branchId);
            if (!branch) {
                return error(res, { code: "BRANCH_NOT_FOUND", message: "Branch not found" }, 404);
            }

            const uid = req.user._id.toString();
            const requiredLevel = BRANCH_ROLE_HIERARCHY[requiredBranchRole] || 1;

            // Check if user is the branch owner
            if (branch.ownerId && branch.ownerId.toString() === uid) {
                return next(); // owner satisfies all levels
            }

            // Check member role
            const member = branch.members.find(m => m.userId.toString() === uid);
            if (!member) {
                return error(res, { code: "FORBIDDEN_BRANCH_ACCESS", message: "You are not a member of this branch" }, 403);
            }

            const memberLevel = BRANCH_ROLE_HIERARCHY[member.roleInBranch] || 0;
            if (memberLevel < requiredLevel) {
                return error(res, {
                    code: "FORBIDDEN_INSUFFICIENT_BRANCH_ROLE",
                    message: `Requires branch role '${requiredBranchRole}' or higher`
                }, 403);
            }

            next();
        } catch (err) {
            return error(res, err);
        }
    };
};

module.exports = {
    verifyToken,
    authorizeRoles,
    authorizeBranchAccess,
};
