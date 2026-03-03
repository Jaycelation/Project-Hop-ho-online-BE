const User = require("../models/UserModel");
const { success, error } = require("../utils/responseHandler");
const logAudit = require("../utils/auditLogger");
const bcrypt = require("bcrypt");

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
        const { fullName, phone, address, avatarUrl } = req.body;

        const updateFields = {};
        if (fullName !== undefined) updateFields.fullName = fullName;
        if (phone !== undefined) updateFields.phone = phone;
        if (address !== undefined) updateFields.address = address;
        if (avatarUrl !== undefined) updateFields.avatarUrl = avatarUrl;

        const originalUser = await User.findById(req.user.id).select("-passwordHash");

        const user = await User.findByIdAndUpdate(
            req.user.id,
            updateFields,
            { new: true, runValidators: true }
        ).select("-passwordHash");

        await logAudit({
            actorId: req.user.id,
            action: "UPDATE",
            entityType: "User",
            entityId: user._id,
            before: originalUser,
            after: user
        }, req);

        return success(res, user);
    } catch (err) {
        return error(res, err);
    }
};

// Change current user password
exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        const user = await User.findById(req.user.id);
        if (!user) {
            return error(res, { code: "USER_NOT_FOUND", message: "User not found" }, 404);
        }

        // 1. Kiểm tra mật khẩu hiện tại có đúng không
        const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isMatch) {
            return error(res, { code: "INVALID_PASSWORD", message: "Mật khẩu hiện tại không chính xác" }, 400);
        }

        // 2. Hash mật khẩu mới
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // 3. Cập nhật DB
        user.passwordHash = hashedPassword;
        await user.save();

        // 4. Ghi log
        await logAudit({
            actorId: req.user.id,
            action: "CHANGE_PASSWORD",
            entityType: "User",
            entityId: user._id,
        }, req);

        return success(res, { message: "Đổi mật khẩu thành công" });
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

        if (id === req.user.id.toString()) {
            return error(res, { code: "FORBIDDEN", message: "You cannot change your own role" }, 403);
        }

        if (!["admin", "editor", "member", "guest"].includes(role)) {
            return error(res, { code: "INVALID_ROLE", message: "Invalid role" }, 400);
        }

        const originalUser = await User.findById(id).select("-passwordHash");

        const user = await User.findByIdAndUpdate(
            id,
            { role },
            { new: true }
        ).select("-passwordHash");

        if (!user) {
            return error(res, { code: "USER_NOT_FOUND", message: "User not found" }, 404);
        }

        await logAudit({
            actorId: req.user.id,
            action: "UPDATE_ROLE",
            entityType: "User",
            entityId: user._id,
            before: { role: originalUser?.role },
            after: { role: user.role }
        }, req);

        return success(res, user);
    } catch (err) {
        return error(res, err);
    }
};

// Admin: Ban/Unban user
exports.banUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { isBanned } = req.body;

        if (id === req.user.id.toString()) {
            return error(res, { code: "FORBIDDEN", message: "You cannot ban yourself" }, 403);
        }

        const originalUser = await User.findById(id).select("-passwordHash");

        const user = await User.findByIdAndUpdate(
            id,
            { isBanned: Boolean(isBanned) },
            { new: true }
        ).select("-passwordHash");

        if (!user) {
            return error(res, { code: "USER_NOT_FOUND", message: "User not found" }, 404);
        }

        await logAudit({
            actorId: req.user.id,
            action: isBanned ? "BAN_USER" : "UNBAN_USER",
            entityType: "User",
            entityId: user._id,
            before: { isBanned: originalUser?.isBanned },
            after: { isBanned: user.isBanned }
        }, req);

        return success(res, user);
    } catch (err) {
        return error(res, err);
    }
};
