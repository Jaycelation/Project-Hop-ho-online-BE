const { z } = require("zod");

// ─── Create Person ─────────────────────────────────────────────────────────────
const createPersonSchema = z.object({
    branchId: z.string().min(1, "branchId is required"),
    fullName: z.string().min(1, "fullName is required").max(200),
    otherNames: z.string().max(200).optional().default(""),

    gender: z.enum(["male", "female", "other", "unknown"]).optional().default("unknown"),

    // Gregorian dates (ISO string, converted to Date by Mongoose)
    dateOfBirth: z.string().optional().nullable(),
    dateOfDeath: z.string().optional().nullable(),

    // Lunar calendar dates (free-form strings like "15/08/Kỷ Mùi")
    lunarDateOfBirth: z.string().max(100).optional().default(""),
    lunarDateOfDeath: z.string().max(100).optional().default(""),

    // Vital status
    isAlive: z.boolean().optional().default(true),

    // Genealogy
    birthOrder: z.number().int().min(1).optional().nullable(),
    subBranch: z.string().max(200).optional().default(""),
    occupation: z.string().max(200).optional().default(""),

    // Location
    hometown: z.string().max(500).optional().default(""),
    currentAddress: z.string().max(500).optional().default(""),

    // Legacy / shared
    phone: z.string().max(20).optional().default(""),
    address: z.string().max(500).optional().default(""),
    privacy: z.enum(["public", "internal", "sensitive"]).optional().default("internal"),
    note: z.string().max(5000).optional().default(""),
    generation: z.number().int().optional().nullable(),
});

// ─── Update Person ─────────────────────────────────────────────────────────────
const updatePersonSchema = z.object({
    fullName: z.string().min(1).max(200).optional(),
    otherNames: z.string().max(200).optional(),
    gender: z.enum(["male", "female", "other", "unknown"]).optional(),

    dateOfBirth: z.string().optional().nullable(),
    dateOfDeath: z.string().optional().nullable(),

    lunarDateOfBirth: z.string().max(100).optional(),
    lunarDateOfDeath: z.string().max(100).optional(),

    isAlive: z.boolean().optional(),

    birthOrder: z.number().int().min(1).optional().nullable(),
    subBranch: z.string().max(200).optional(),
    occupation: z.string().max(200).optional(),

    hometown: z.string().max(500).optional(),
    currentAddress: z.string().max(500).optional(),

    phone: z.string().max(20).optional(),
    address: z.string().max(500).optional(),
    privacy: z.enum(["public", "internal", "sensitive"]).optional(),
    note: z.string().max(5000).optional(),
    generation: z.number().int().optional().nullable(),
});

module.exports = { createPersonSchema, updatePersonSchema };
