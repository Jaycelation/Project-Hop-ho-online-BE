const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();

app.set("trust proxy", 1);
app.use(morgan("dev"));

app.use(cors({ origin: true, credentials: true }));

app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 2000,
    message: { success: false, message: "Quá nhiều request, vui lòng thử lại sau." },
    standardHeaders: true,
    legacyHeaders: false,
});
const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 500,
    message: { success: false, message: "Quá nhiều lần đăng nhập, vui lòng thử lại sau." },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use("/api/", generalLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

function sanitizeValue(val) {
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
        for (const key of Object.keys(val)) {
            if (key.startsWith("$")) {
                delete val[key];
            } else {
                sanitizeValue(val[key]);
            }
        }
    } else if (Array.isArray(val)) {
        val.forEach(sanitizeValue);
    }
    return val;
}
app.use((req, res, next) => {
    if (req.body) sanitizeValue(req.body);
    if (req.params) sanitizeValue(req.params);
    next();
});

const storageDir = path.join(__dirname, "..", "storage");
app.use("/storage", express.static(storageDir));

// --- Routes ---
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const branchRoutes = require("./routes/branchRoutes");
const personRoutes = require("./routes/personRoutes");
const relationshipRoutes = require("./routes/relationshipRoutes");
const eventRoutes = require("./routes/eventRoutes");
const mediaRoutes = require("./routes/mediaRoutes");
const searchRoutes = require("./routes/searchRoutes");
const auditRoutes = require("./routes/auditRoutes");
const systemRoutes = require("./routes/systemRoutes");
const moderationRoutes = require("./routes/moderationRoutes");
const postRoutes = require("./routes/postRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/persons", personRoutes);
app.use("/api/relationships", relationshipRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/moderation", moderationRoutes);
app.use("/api/posts", postRoutes);
app.use("/api", systemRoutes);
app.use("/api/calendar", require("./routes/calendarRoutes"));

// Error Handler
const errorHandler = require("./middlewares/errorHandler");
app.use(errorHandler);

app.get("/", (req, res) => res.json({ ok: true }));

module.exports = app;