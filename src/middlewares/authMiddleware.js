const jwt = require("jsonwebtoken");
const User = require("../models/UserModel"); // Assuming User model exists
const { error } = require("../utils/responseHandler");

const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return error(res, { code: "AUTH_MISSING_TOKEN", message: "No token provided" }, 401);
        }

        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");

        const user = await User.findById(decoded.id).select("-password -refreshToken");
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

const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return error(res, { code: "FORBIDDEN_INSUFFICIENT_ROLE", message: "Insufficient permissions" }, 403);
        }
        next();
    };
};

const checkPrivacy = (req, res, next) => {
    // This is a placeholder. Logic depends on specific resource privacy fields.
    // Usually implemented inside controllers or specific resource middlewares
    next();
};

module.exports = {
    verifyToken,
    authorizeRoles,
    checkPrivacy,
};
