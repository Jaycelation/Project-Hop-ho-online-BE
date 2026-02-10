const mongoose = require("mongoose");

const EventSchema = new mongoose.Schema(
    {
        branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", required: true, index: true },

        title: { type: String, required: true, trim: true, index: true },
        type: { type: String, enum: ["birth", "death", "marriage", "anniversary", "other"], default: "other", index: true },
        eventDate: { type: Date, default: null, index: true },
        location: { type: String, default: "" },
        description: { type: String, default: "" },

        personIds: { type: [mongoose.Schema.Types.ObjectId], ref: "Person", default: [] },

        privacy: { type: String, enum: ["public", "internal", "sensitive"], default: "internal", index: true },

        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true }
);

EventSchema.index({ title: "text", description: "text", location: "text" });

module.exports = mongoose.model("Event", EventSchema);