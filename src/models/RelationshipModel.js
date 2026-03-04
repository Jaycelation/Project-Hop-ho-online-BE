const mongoose = require("mongoose");

const RelationshipSchema = new mongoose.Schema(
    {
        branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", required: true, index: true },

        fromPersonId: { type: mongoose.Schema.Types.ObjectId, ref: "Person", required: true, index: true },
        toPersonId: { type: mongoose.Schema.Types.ObjectId, ref: "Person", required: true, index: true },

        type: { type: String, enum: ["parent_of", "spouse_of", "sibling_of"], required: true, index: true },

        // ── New: Spouse relationship metadata ──────────────────────────────────
        status: {
            type: String,
            enum: ["married", "divorced", "separated", "unknown"],
            default: "unknown",
        },
        startDate: { type: String, default: "" },   // Ngày kết hôn (string, can be lunar)
        endDate: { type: String, default: "" },   // Ngày ly hôn

        // ── New: Parent-child sub type ─────────────────────────────────────────
        subType: {
            type: String,
            enum: ["biological", "adopted", "stepchild", "unknown"],
            default: "biological",
        },

        // ── New: General note ─────────────────────────────────────────────────
        note: { type: String, default: "" },

        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    },
    { timestamps: true }
);

RelationshipSchema.index({ branchId: 1, fromPersonId: 1, toPersonId: 1, type: 1 }, { unique: true });

module.exports = mongoose.model("Relationship", RelationshipSchema);