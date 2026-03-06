const { z } = require("zod");

const registerSchema = z.object({
    username: z.string().min(3, "Tên đăng nhập phải có ít nhất 3 ký tự"),
    email: z.string().email("Email không hợp lệ").optional().or(z.literal("")),
    password: z.string().min(6, "Mật khẩu phải có ít nhất 6 ký tự"),
    fullName: z.string().min(1, "Vui lòng nhập họ và tên"),
});

const loginSchema = z.object({
    username: z.string().min(1, "Vui lòng nhập tên đăng nhập"),
    password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

module.exports = { registerSchema, loginSchema };