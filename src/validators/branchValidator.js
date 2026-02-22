const { z } = require("zod");

const createBranchSchema = z.object({
    name: z.string().min(1, "Branch name is required").max(200),
    description: z.string().max(1000).optional().default(""),
});

const updateBranchSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).optional(),
});

const addMemberSchema = z.object({
    userId: z.string().min(1, "userId is required"),
    roleInBranch: z.enum(["owner", "editor", "viewer"]).optional().default("viewer"),
});

module.exports = { createBranchSchema, updateBranchSchema, addMemberSchema };
