const User = require("../models/UserModel");
const { success, error } = require("../utils/responseHandler");

// Get current user profile
exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select("-passwordHash");
        if (!user) {
            return error(res, { code: "USER_NOT_FOUND", message: "User not found" }, 404);
        }
        return success(res, user);
    } catch (err) {
        return error(res, err);
    }
};

// Update current user profile
exports.updateMe = async (req, res) => {
    try {
        const { fullName } = req.body;
        // Allows updating fullName, maybe avatar later if added to User model
        const user = await User.findByIdAndUpdate(
            req.user.id,
            { fullName },
            { new: true, runValidators: true }
        ).select("-passwordHash");

        return success(res, user);
    } catch (err) {
        return error(res, err);
    }
};

// Admin: List all users
exports.listUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const users = await User.find()
            .select("-passwordHash")
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        const total = await User.countDocuments();

        return success(res, users, {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        });
    } catch (err) {
        return error(res, err);
    }
};

// Admin: Update user role
exports.updateUserRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;

        if (!["admin", "editor", "member", "guest"].includes(role)) {
            return error(res, { code: "INVALID_ROLE", message: "Invalid role" }, 400);
        }

        const user = await User.findByIdAndUpdate(
            id,
            { role },
            { new: true }
        ).select("-passwordHash");

        if (!user) {
            return error(res, { code: "USER_NOT_FOUND", message: "User not found" }, 404);
        }

        return success(res, user);
    } catch (err) {
        return error(res, err);
    }
};

// Admin: Ban/Unban user
exports.banUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { isBanned } = req.body; // Expect boolean

        const user = await User.findByIdAndUpdate(
            id,
            { isBanned: Boolean(isBanned) },
            { new: true }
        ).select("-passwordHash");

        if (!user) {
            return error(res, { code: "USER_NOT_FOUND", message: "User not found" }, 404);
        }

        return success(res, user);
    } catch (err) {
        return error(res, err);
    }
};
