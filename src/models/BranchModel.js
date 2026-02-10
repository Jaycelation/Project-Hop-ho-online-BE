const mongoose = require("mongoose");

const BranchMemberSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        roleInBranch: { type: String, enum: ["owner", "editor", "viewer"], default: "viewer" },
        joinedAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

const BranchSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, index: true },
        description: { type: String, default: "" },
        ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        members: { type: [BranchMemberSchema], default: [] },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Branch", BranchSchema);
