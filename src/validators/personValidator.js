const { z } = require("zod");

const createPersonSchema = z.object({
    branchId: z.string().min(1, "branchId is required"),
    fullName: z.string().min(1, "fullName is required").max(200),
    gender: z.enum(["male", "female", "other", "unknown"]).optional().default("unknown"),
    dateOfBirth: z.string().optional().nullable(),
    dateOfDeath: z.string().optional().nullable(),
    phone: z.string().max(20).optional().default(""),
    address: z.string().max(500).optional().default(""),
    privacy: z.enum(["public", "internal", "sensitive"]).optional().default("internal"),
    note: z.string().max(2000).optional().default(""),
    generation: z.number().int().optional().nullable(),
});

const updatePersonSchema = z.object({
    fullName: z.string().min(1).max(200).optional(),
    gender: z.enum(["male", "female", "other", "unknown"]).optional(),
    dateOfBirth: z.string().optional().nullable(),
    dateOfDeath: z.string().optional().nullable(),
    phone: z.string().max(20).optional(),
    address: z.string().max(500).optional(),
    privacy: z.enum(["public", "internal", "sensitive"]).optional(),
    note: z.string().max(2000).optional(),
    generation: z.number().int().optional().nullable(),
});

module.exports = { createPersonSchema, updatePersonSchema };
