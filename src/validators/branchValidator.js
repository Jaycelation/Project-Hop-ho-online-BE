const { z } = require("zod");

const rootPersonSchema = z.object({
    fullName: z.string().min(1, "Tên thủy tổ là bắt buộc").max(200),
    gender: z.enum(["male", "female", "other"], { errorMap: () => ({ message: "Giới tính không hợp lệ" }) }),
    dateOfBirth: z.string().optional().default(""),
    birthYear: z.number().int().min(1).max(2100).nullable().optional(),
    hometown: z.string().max(300).optional().default(""),
    note: z.string().max(1000).optional().default(""),
});

const createBranchSchema = z.object({
    name: z.string().min(1, "Tên chi nhánh là bắt buộc").max(200),
    description: z.string().max(1000).optional().default(""),
    root: rootPersonSchema.optional(), // optional; if omitted branch is created without a root
});

const updateBranchSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).optional(),
    rootPersonId: z.string().optional(), // allow setting root later
});

const addMemberSchema = z.object({
    userId: z.string().min(1, "userId is required"),
    roleInBranch: z.enum(["owner", "editor", "viewer"]).optional().default("viewer"),
});

module.exports = { createBranchSchema, updateBranchSchema, addMemberSchema };
