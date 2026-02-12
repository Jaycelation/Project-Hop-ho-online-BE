const express = require("express");
const router = express.Router();
const auditController = require("../controllers/auditController");
const { verifyToken, authorizeRoles } = require("../middlewares/authMiddleware");

router.get("/", verifyToken, authorizeRoles("admin"), auditController.listAuditLogs);
router.get("/:id", verifyToken, authorizeRoles("admin"), auditController.getAuditLog);

module.exports = router;
