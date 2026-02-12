const AuditLog = require("../models/AuditLogModel");

/**
 * Log an audit entry
 * @param {Object} params
 * @param {string} params.actorId - User ID performing the action
 * @param {string} params.action - Action name (e.g., CREATE, UPDATE, DELETE)
 * @param {string} params.entityType - Type of entity (User, Branch, Person, etc.)
 * @param {string} params.entityId - ID of the entity
 * @param {string} [params.branchId] - Optional Branch ID
 * @param {Object} [params.before] - State before change
 * @param {Object} [params.after] - State after change
 * @param {Object} [req] - Express request object for IP/UserAgent
 */
const logAudit = async ({ actorId, action, entityType, entityId, branchId, before, after }, req = null) => {
    try {
        const payload = {
            actorUserId: actorId,
            action,
            entityType,
            entityId,
            branchId: branchId || null,
            before: before || null,
            after: after || null,
        };

        if (req) {
            payload.ip = req.ip || req.connection.remoteAddress;
            payload.userAgent = req.headers["user-agent"];
        }

        await AuditLog.create(payload);
    } catch (err) {
        console.error("Audit Log Error:", err);
        // Do not block main flow if audit fails
    }
};

module.exports = logAudit;
