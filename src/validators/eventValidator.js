const { z } = require("zod");

const createEventSchema = z.object({
    branchId: z.string().min(1, "branchId is required"),
    title: z.string().min(1, "Title is required").max(300),
    type: z.enum(["birth", "death", "marriage", "anniversary", "other"]).optional().default("other"),
    eventDate: z.string().optional().nullable(),
    location: z.string().max(500).optional().default(""),
    description: z.string().max(5000).optional().default(""),
    personIds: z.array(z.string()).optional().default([]),
    privacy: z.enum(["public", "internal", "sensitive"]).optional().default("internal"),
});

const updateEventSchema = z.object({
    title: z.string().min(1).max(300).optional(),
    type: z.enum(["birth", "death", "marriage", "anniversary", "other"]).optional(),
    eventDate: z.string().optional().nullable(),
    location: z.string().max(500).optional(),
    description: z.string().max(5000).optional(),
    personIds: z.array(z.string()).optional(),
    privacy: z.enum(["public", "internal", "sensitive"]).optional(),
});

module.exports = { createEventSchema, updateEventSchema };
