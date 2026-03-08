const mongoose = require("mongoose");

const PostSchema = new mongoose.Schema(
    {
        branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", required: true, index: true },

        user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        
        content: { type: String, required: true },
        image_url: { type: String, default: "" }, 
        feeling: { type: String, default: "" }, 
        likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        
        status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    },
    { timestamps: true }
);

PostSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Post", PostSchema);