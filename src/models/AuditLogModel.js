const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema(
    {
        actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        action: { type: String, required: true, index: true },
        entityType: { type: String, required: true, index: true },
        entityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

        branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null, index: true },

        ip: { type: String, default: "" },
        userAgent: { type: String, default: "" },

        before: { type: Object, default: null },
        after: { type: Object, default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.model("AuditLog", AuditLogSchema);
