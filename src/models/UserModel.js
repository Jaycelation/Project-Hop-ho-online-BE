const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
    {
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        passwordHash: { type: String, required: true },
        fullName: { type: String, default: "" },
        phone: { type: String, default: "" },
        address: { type: String, default: "" },
        avatarUrl: { type: String, default: "" },
        role: {
            type: String,
            enum: ["admin", "editor", "member", "guest"],
            default: "member",
            index: true,
        },
        isBanned: { type: Boolean, default: false },
        lastLoginAt: { type: Date, default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
