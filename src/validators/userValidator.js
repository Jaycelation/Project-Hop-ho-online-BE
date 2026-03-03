const { z } = require("zod");

const updateMeSchema = z.object({
    fullName: z.string().min(1).max(100).optional(),
    phone: z.string().max(20).optional(),
    address: z.string().max(255).optional(),
    avatarUrl: z.string().url("Invalid URL format").optional().or(z.literal("")),
});

const updateUserRoleSchema = z.object({
    role: z.enum(["admin", "editor", "member", "guest"], {
        errorMap: () => ({ message: "Role must be one of: admin, editor, member, guest" })
    }),
});

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Vui lòng nhập mật khẩu hiện tại"),
    newPassword: z.string().min(6, "Mật khẩu mới phải có ít nhất 6 ký tự"),
});

const banUserSchema = z.object({
    isBanned: z.boolean({ required_error: "isBanned is required" }),
});

module.exports = { updateMeSchema, updateUserRoleSchema, banUserSchema, changePasswordSchema };