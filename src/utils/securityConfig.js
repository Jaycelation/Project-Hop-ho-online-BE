const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const DEFAULT_DEV_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
];

function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.trim().length < 32) {
        throw new Error("JWT_SECRET must be set and be at least 32 characters long");
    }
    return secret;
}

function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function getAllowedOrigins() {
    const configured = [
        process.env.CORS_ORIGIN,
        process.env.CLIENT_URL,
        process.env.FRONTEND_URL,
        process.env.APP_ORIGIN,
    ]
        .filter(Boolean)
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean);

    if (configured.length > 0) {
        return Array.from(new Set(configured));
    }

    if (process.env.NODE_ENV !== "production") {
        return DEFAULT_DEV_ORIGINS;
    }

    return [];
}

function getCorsOptions() {
    const allowedOrigins = getAllowedOrigins();

    return {
        origin(origin, callback) {
            if (!origin) {
                return callback(null, true);
            }

            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            return callback(new Error("Origin not allowed by CORS"));
        },
        credentials: true,
        optionsSuccessStatus: 204,
    };
}

function getCookieOptions() {
    const sameSite = process.env.COOKIE_SAME_SITE || (process.env.NODE_ENV === "production" ? "lax" : "lax");
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite,
        path: "/api/auth",
        maxAge: 7 * 24 * 60 * 60 * 1000,
    };
}

function getJwtSignOptions() {
    return {
        expiresIn: process.env.JWT_EXPIRES_IN || "15m",
        issuer: process.env.JWT_ISSUER || "gia-pha-online",
        audience: process.env.JWT_AUDIENCE || "gia-pha-online-client",
    };
}

function getRefreshTokenTtlMs() {
    return Number(process.env.REFRESH_TOKEN_TTL_MS || 7 * 24 * 60 * 60 * 1000);
}

function getMediaTokenOptions() {
    const jwtOptions = getJwtSignOptions();
    return {
        issuer: jwtOptions.issuer,
        audience: `${jwtOptions.audience}:media`,
        expiresIn: Number(process.env.MEDIA_ACCESS_TOKEN_TTL_SECONDS || 300),
    };
}

function createMediaAccessToken({ mediaId, userId, branchId }) {
    if (!mediaId) {
        throw new Error("mediaId is required to create media access token");
    }

    const options = getMediaTokenOptions();
    return jwt.sign(
        {
            type: "media-access",
            mediaId: String(mediaId),
            userId: userId ? String(userId) : undefined,
            branchId: branchId ? String(branchId) : undefined,
        },
        getJwtSecret(),
        {
            issuer: options.issuer,
            audience: options.audience,
            expiresIn: options.expiresIn,
            subject: String(mediaId),
        }
    );
}

function verifyMediaAccessToken(token, expectedMediaId) {
    const options = getMediaTokenOptions();
    const decoded = jwt.verify(token, getJwtSecret(), {
        issuer: options.issuer,
        audience: options.audience,
    });

    if (decoded.type !== "media-access") {
        throw new Error("Invalid media token type");
    }

    if (expectedMediaId && String(decoded.mediaId) !== String(expectedMediaId)) {
        throw new Error("Media token does not match requested resource");
    }

    return decoded;
}

module.exports = {
    getJwtSecret,
    hashToken,
    getAllowedOrigins,
    getCorsOptions,
    getCookieOptions,
    getJwtSignOptions,
    getRefreshTokenTtlMs,
    getMediaTokenOptions,
    createMediaAccessToken,
    verifyMediaAccessToken,
};
