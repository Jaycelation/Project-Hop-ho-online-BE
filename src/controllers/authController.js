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
        const { email, password, fullName } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return error(res, { code: "AUTH_EMAIL_ALREADY_EXISTS", message: "Email already exists" }, 409);
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const newUser = await User.create({
            email,
            passwordHash,
            fullName,
            role: "member"
        });

        await logAudit({
            actorId: newUser._id,
            action: "REGISTER",
            entityType: "User",
            entityId: newUser._id,
            after: { email: newUser.email, fullName: newUser.fullName }
        }, req);

        // Auto-login after register
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
            user: { id: newUser._id, email: newUser.email, role: newUser.role, fullName: newUser.fullName }
        }, null, 201);
    } catch (err) {
        return error(res, err);
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return error(res, { code: "AUTH_INVALID_CREDENTIALS", message: "Invalid email or password" }, 401);
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return error(res, { code: "AUTH_INVALID_CREDENTIALS", message: "Invalid email or password" }, 401);
        }

        if (user.isBanned) {
            return error(res, { code: "AUTH_USER_BANNED", message: "User is banned" }, 403);
        }

        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers["user-agent"] || "";

        const { accessToken, refreshToken } = await generateTokens(user, ip, userAgent);

        // Update last login
        user.lastLoginAt = new Date();
        await user.save();

        await logAudit({
            actorId: user._id,
            action: "LOGIN",
            entityType: "User",
            entityId: user._id,
        }, req);

        // Set refresh token in cookie
        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        return success(res, { accessToken, user: { id: user._id, email: user.email, role: user.role, fullName: user.fullName } });
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
