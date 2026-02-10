const mongoose = require("mongoose");

const MediaSchema = new mongoose.Schema(
    {
        branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
        personId: { type: mongoose.Schema.Types.ObjectId, ref: "Person", default: null, index: true },
        eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event", default: null, index: true },

        kind: { type: String, enum: ["image", "video"], required: true, index: true },
        originalName: { type: String, required: true },
        mimeType: { type: String, required: true },
        sizeBytes: { type: Number, required: true },

        storagePath: { type: String, required: true },
        hlsPath: { type: String, default: "" },

        privacy: { type: String, enum: ["public", "internal", "sensitive"], default: "internal", index: true },

        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Media", MediaSchema);
