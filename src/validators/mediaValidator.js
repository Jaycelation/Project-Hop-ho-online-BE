const { z } = require("zod");

const uploadMediaSchema = z.object({
    branchId: z.string().min(1, "branchId is required"),
    personId: z.string().optional().nullable(),
    eventId: z.string().optional().nullable(),
    caption: z.string().max(1000).optional().default(""),
    privacy: z.enum(["public", "internal", "sensitive"]).optional().default("internal"),
});

const updateMediaSchema = z.object({
    caption: z.string().max(1000).optional(),
    privacy: z.enum(["public", "internal", "sensitive"]).optional(),
    personId: z.string().optional().nullable(),
    eventId: z.string().optional().nullable(),
});

module.exports = { uploadMediaSchema, updateMediaSchema };
