const mongoose = require("mongoose");

const PersonSchema = new mongoose.Schema(
    {
        branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", required: true, index: true },

        fullName: { type: String, required: true, trim: true, index: true },
        gender: { type: String, enum: ["male", "female", "other", "unknown"], default: "unknown" },
        dateOfBirth: { type: Date, default: null },
        dateOfDeath: { type: Date, default: null },
        phone: { type: String, default: "" },
        address: { type: String, default: "" },

        privacy: { type: String, enum: ["public", "internal", "sensitive"], default: "internal", index: true },

        note: { type: String, default: "" },
        avatarMediaId: { type: mongoose.Schema.Types.ObjectId, ref: "Media", default: null },

        generation: { type: Number, default: null, index: true },

        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true }
);

PersonSchema.index({ fullName: "text", note: "text" });

module.exports = mongoose.model("Person", PersonSchema);