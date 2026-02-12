const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");

const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(morgan("dev"));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// Routes
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

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/persons", personRoutes);
app.use("/api/relationships", relationshipRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api", systemRoutes); // For /api/health

// Error Handler
const errorHandler = require("./middlewares/errorHandler");
app.use(errorHandler);

app.get("/", (req, res) => res.json({ ok: true }));

module.exports = app;
