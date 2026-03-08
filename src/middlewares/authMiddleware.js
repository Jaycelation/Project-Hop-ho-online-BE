const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/UserModel");
const Branch = require("../models/BranchModel");
const { error } = require("../utils/responseHandler");
const { hasBranchRole, getBranchRoleForUser, getAccessibleBranchIds } = require("../utils/branchAccess");
const { getJwtSecret, getJwtSignOptions } = require("../utils/securityConfig");

async function resolveUserFromBearerToken(token) {
    const jwtOptions = getJwtSignOptions();
    const decoded = jwt.verify(token, getJwtSecret(), {
        issuer: jwtOptions.issuer,
        audience: jwtOptions.audience,
    });

    const user = await User.findById(decoded.id).select("-password -refreshToken");
    if (!user) {
        const err = new Error("User not found");
        err.statusCode = 401;
        err.errorCode = "AUTH_USER_NOT_FOUND";
        throw err;
    }

    if (user.isBanned) {
        const err = new Error("User is banned");
        err.statusCode = 403;
        err.errorCode = "AUTH_USER_BANNED";
        throw err;
    }

    return user;
}

const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return error(res, { code: "AUTH_MISSING_TOKEN", message: "No token provided" }, 401);
        }

        const token = authHeader.split(" ")[1];
        req.user = await resolveUserFromBearerToken(token);
        next();
    } catch (err) {
        if (err.name === "TokenExpiredError") {
            return error(res, { code: "AUTH_TOKEN_EXPIRED", message: "Token expired" }, 401);
        }
        return error(res, { code: err.errorCode || "AUTH_INVALID_TOKEN", message: err.message || "Invalid token" }, err.statusCode || 401);
    }
};

const optionalVerifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return next();
        }

        const token = authHeader.split(" ")[1];
        req.user = await resolveUserFromBearerToken(token);
        next();
    } catch (err) {
        if (err.name === "TokenExpiredError") {
            return error(res, { code: "AUTH_TOKEN_EXPIRED", message: "Token expired" }, 401);
        }
        return error(res, { code: err.errorCode || "AUTH_INVALID_TOKEN", message: err.message || "Invalid token" }, err.statusCode || 401);
    }
};

const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return error(res, { code: "FORBIDDEN_INSUFFICIENT_ROLE", message: "Insufficient permissions" }, 403);
        }
        next();
    };
};

function getValueByPath(obj, path) {
    return path.split(".").reduce((acc, part) => (acc == null ? undefined : acc[part]), obj);
}

const authorizeBranchAccess = (requiredRole = "viewer", options = {}) => {
    return async (req, res, next) => {
        try {
            const paths = options.paths || ["params.branchId", "params.id", "body.branchId", "query.branchId"];
            let branchId;

            for (const path of paths) {
                const value = getValueByPath(req, path);
                if (value !== undefined && value !== null && value !== "") {
                    branchId = value;
                    break;
                }
            }

            if ((branchId === undefined || branchId === null || branchId === "") && options.optional) {
                return next();
            }

            if (!branchId) {
                return error(res, { code: "BRANCH_CONTEXT_REQUIRED", message: "Branch context is required" }, 400);
            }

            if (!mongoose.Types.ObjectId.isValid(branchId)) {
                return error(res, { code: "INVALID_BRANCH_ID", message: "Invalid branch id" }, 400);
            }

            const branch = await Branch.findById(branchId);
            if (!branch) {
                return error(res, { code: "BRANCH_NOT_FOUND", message: "Branch not found" }, 404);
            }

            if (!hasBranchRole(branch, req.user, requiredRole)) {
                return error(res, { code: "FORBIDDEN_BRANCH_ACCESS", message: "Access denied to this branch" }, 403);
            }

            req.branch = branch;
            req.branchId = branch._id.toString();
            req.branchRole = getBranchRoleForUser(branch, req.user);
            next();
        } catch (err) {
            next(err);
        }
    };
};

const authorizeResourceBranchAccess = (Model, requiredRole = "viewer", options = {}) => {
    return async (req, res, next) => {
        try {
            const resourceId = req.params[options.param || "id"];
            const resourceName = options.resourceName || "Resource";
            const branchField = options.branchField || "branchId";

            if (!resourceId || !mongoose.Types.ObjectId.isValid(resourceId)) {
                return error(res, { code: "INVALID_RESOURCE_ID", message: `Invalid ${resourceName.toLowerCase()} id` }, 400);
            }

            const resource = await Model.findById(resourceId).select(branchField);
            if (!resource) {
                return error(res, { code: `${resourceName.toUpperCase()}_NOT_FOUND`, message: `${resourceName} not found` }, 404);
            }

            const branchId = resource[branchField];
            if (!branchId) {
                return error(res, { code: "BRANCH_CONTEXT_REQUIRED", message: `${resourceName} is missing branch context` }, 400);
            }

            const branch = await Branch.findById(branchId);
            if (!branch) {
                return error(res, { code: "BRANCH_NOT_FOUND", message: "Branch not found" }, 404);
            }

            if (!hasBranchRole(branch, req.user, requiredRole)) {
                return error(res, { code: "FORBIDDEN_BRANCH_ACCESS", message: `Access denied to this ${resourceName.toLowerCase()}` }, 403);
            }

            req.branch = branch;
            req.branchId = branch._id.toString();
            req.branchRole = getBranchRoleForUser(branch, req.user);
            req.resource = resource;
            next();
        } catch (err) {
            next(err);
        }
    };
};

module.exports = {
    verifyToken,
    optionalVerifyToken,
    authorizeRoles,
    authorizeBranchAccess,
    authorizeResourceBranchAccess,
    getAccessibleBranchIds,
};
