const mongoose = require("mongoose");

/**
 * PostModel — simple social feed posts scoped to a branch.
 * Status lifecycle: pending → approved | rejected
 * All posts default to "pending" and must be approved by a branch editor/owner.
 */
const PostSchema = new mongoose.Schema(
    {
        branchId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: true,
            index: true,
        },
        authorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        content: {
            type: String,
            required: true,
            trim: true,
            maxlength: 5000,
        },
        status: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending",
            index: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Post", PostSchema);
