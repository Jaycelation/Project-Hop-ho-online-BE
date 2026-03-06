const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const User = require("../models/UserModel");
const RefreshToken = require("../models/RefreshTokenModel");
const { success, error } = require("../utils/responseHandler");
const logAudit = require("../utils/auditLogger");

const generateTokens = async (user, ip, userAgent) => {
    const accessToken = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET || "secret",
        { expiresIn: "15m" }
    );

    const refreshToken = crypto.randomBytes(40).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await RefreshToken.create({
        userId: user._id,
        tokenHash: refreshToken,
        expiresAt,
        ip,
        userAgent
    });

    return { accessToken, refreshToken };
};

exports.register = async (req, res) => {
    try {
        const { username, email, password, fullName } = req.body;

        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return error(res, { code: "AUTH_USERNAME_ALREADY_EXISTS", message: "Username đã tồn tại" }, 409);
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const newUser = await User.create({
            username,
            email: email || "",
            passwordHash,
            fullName,
            role: "member",
            isFirstLogin: true
        });

        await logAudit({
            actorId: newUser._id,
            action: "REGISTER",
            entityType: "User",
            entityId: newUser._id,
            after: { username: newUser.username, fullName: newUser.fullName }
        }, req);

        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers["user-agent"] || "";
        const { accessToken, refreshToken } = await generateTokens(newUser, ip, userAgent);

        newUser.lastLoginAt = new Date();
        await newUser.save();

        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        return success(res, {
            accessToken,
            user: { 
                id: newUser._id, 
                username: newUser.username, 
                role: newUser.role, 
                fullName: newUser.fullName,
                isFirstLogin: newUser.isFirstLogin
            }
        }, null, 201);
    } catch (err) {
        return error(res, err);
    }
};

exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;

        const user = await User.findOne({ username });
        if (!user) {
            return error(res, { code: "AUTH_INVALID_CREDENTIALS", message: "Sai tên đăng nhập hoặc mật khẩu" }, 401);
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return error(res, { code: "AUTH_INVALID_CREDENTIALS", message: "Sai tên đăng nhập hoặc mật khẩu" }, 401);
        }

        if (user.isBanned) {
            return error(res, { code: "AUTH_USER_BANNED", message: "Tài khoản đã bị khóa" }, 403);
        }

        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers["user-agent"] || "";

        const { accessToken, refreshToken } = await generateTokens(user, ip, userAgent);

        user.lastLoginAt = new Date();
        await user.save();

        await logAudit({
            actorId: user._id,
            action: "LOGIN",
            entityType: "User",
            entityId: user._id,
        }, req);

        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        return success(res, { 
            accessToken, 
            user: { 
                id: user._id, 
                username: user.username, 
                role: user.role, 
                fullName: user.fullName,
                isFirstLogin: user.isFirstLogin
            } 
        });
    } catch (err) {
        return error(res, err);
    }
};

exports.refresh = async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken;
        if (!refreshToken) {
            return error(res, { code: "AUTH_MISSING_REFRESH_TOKEN", message: "No refresh token provided" }, 401);
        }

        const savedToken = await RefreshToken.findOne({ tokenHash: refreshToken });
        if (!savedToken) {
            return error(res, { code: "AUTH_INVALID_REFRESH_TOKEN", message: "Invalid refresh token" }, 403);
        }

        if (savedToken.revokedAt || new Date() > savedToken.expiresAt) {
            return error(res, { code: "AUTH_REFRESH_TOKEN_EXPIRED", message: "Refresh token expired or revoked" }, 403);
        }

        const user = await User.findById(savedToken.userId);
        if (!user) {
            return error(res, { code: "AUTH_USER_NOT_FOUND", message: "User not found" }, 404);
        }

        // Rotate token
        savedToken.revokedAt = new Date();
        savedToken.replacedByTokenHash = "rotated";
        await savedToken.save();

        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers["user-agent"] || "";
        const { accessToken, refreshToken: newRefreshToken } = await generateTokens(user, ip, userAgent);

        res.cookie("refreshToken", newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        return success(res, { accessToken });

    } catch (err) {
        return error(res, err);
    }
};

exports.logout = async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken;
        if (refreshToken) {
            await RefreshToken.findOneAndUpdate(
                { tokenHash: refreshToken },
                { revokedAt: new Date() }
            );
        }

        if (req.user) {
            await logAudit({
                actorId: req.user.id,
                action: "LOGOUT",
                entityType: "User",
                entityId: req.user.id,
            }, req);
        }

        res.clearCookie("refreshToken");
        return success(res, { message: "Logged out successfully" });
    } catch (err) {
        return error(res, err);
    }
};

exports.changePasswordMandatory = async (req, res, next) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const user = await User.findById(req.user.id);

        if (!user) return error(res, { code: "NOT_FOUND", message: "User not found" }, 404);

        const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
        if (!isMatch) {
            return error(res, { code: "AUTH_INVALID_CREDENTIALS", message: "Mật khẩu hiện tại không đúng" }, 401);
        }

        user.passwordHash = await bcrypt.hash(newPassword, 10);
        user.isFirstLogin = false;
        await user.save();

        return success(res, { message: "Đổi mật khẩu thành công!" });
    } catch (err) {
        return error(res, err);
    }
};