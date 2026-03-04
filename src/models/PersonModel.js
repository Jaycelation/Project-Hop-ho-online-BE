const mongoose = require("mongoose");

const PersonSchema = new mongoose.Schema(
    {
        branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", required: true, index: true },

        fullName: { type: String, required: true, trim: true, index: true },
        otherNames: { type: String, default: "" },      // Tên gọi khác / tự / hiệu
        gender: { type: String, enum: ["male", "female", "other", "unknown"], default: "unknown" },

        // Gregorian dates
        dateOfBirth: { type: Date, default: null },
        dateOfDeath: { type: Date, default: null },

        // ── New: Lunar calendar dates (string, e.g. "15/08/Kỷ Mùi") ──────────
        lunarDateOfBirth: { type: String, default: "" },
        lunarDateOfDeath: { type: String, default: "" },

        // ── New: Vital status ──────────────────────────────────────────────────
        isAlive: { type: Boolean, default: true },

        // ── New: Genealogy fields ──────────────────────────────────────────────
        birthOrder: { type: Number, default: null },    // Thứ tự sinh (1 = cả, 2 = hai, ...)
        subBranch: { type: String, default: "" },      // Chi - Ngành (e.g. "Chi 2-ngành 2")
        occupation: { type: String, default: "" },      // Nghề nghiệp

        // ── New: Location fields ───────────────────────────────────────────────
        hometown: { type: String, default: "" },  // Quê quán / nơi sinh
        currentAddress: { type: String, default: "" },  // Nơi ở hiện tại / Nơi an táng

        // ── Existing fields ────────────────────────────────────────────────────
        phone: { type: String, default: "" },
        address: { type: String, default: "" },         // kept for backwards compat

        privacy: { type: String, enum: ["public", "internal", "sensitive"], default: "internal", index: true },
        note: { type: String, default: "" },
        avatarMediaId: { type: mongoose.Schema.Types.ObjectId, ref: "Media", default: null },
        generation: { type: Number, default: null, index: true },

        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true }
);

PersonSchema.index({ fullName: "text", note: "text", otherNames: "text" });

module.exports = mongoose.model("Person", PersonSchema);