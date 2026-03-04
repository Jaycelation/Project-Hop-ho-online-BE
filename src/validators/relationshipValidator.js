const { z } = require("zod");

// ─── Create Relationship ───────────────────────────────────────────────────────
const createRelationshipSchema = z.object({
    branchId: z.string().min(1, "branchId is required"),
    fromPersonId: z.string().min(1, "fromPersonId is required"),
    toPersonId: z.string().min(1, "toPersonId is required"),
    type: z.enum(["parent_of", "spouse_of", "sibling_of"], {
        errorMap: () => ({ message: "Type must be one of: parent_of, spouse_of, sibling_of" })
    }),

    // ── New: spouse metadata ───────────────────────────────────────────────────
    status: z.enum(["married", "divorced", "separated", "unknown"]).optional().default("unknown"),
    startDate: z.string().max(100).optional().default(""),  // marriage date (may be lunar)
    endDate: z.string().max(100).optional().default(""),  // divorce date

    // ── New: parent-child sub type ─────────────────────────────────────────────
    subType: z.enum(["biological", "adopted", "stepchild", "unknown"]).optional().default("biological"),

    // ── New: general note ──────────────────────────────────────────────────────
    note: z.string().max(2000).optional().default(""),
});

// ─── Update Relationship ───────────────────────────────────────────────────────
const updateRelationshipSchema = z.object({
    type: z.enum(["parent_of", "spouse_of", "sibling_of"], {
        errorMap: () => ({ message: "Type must be one of: parent_of, spouse_of, sibling_of" })
    }).optional(),
    status: z.enum(["married", "divorced", "separated", "unknown"]).optional(),
    startDate: z.string().max(100).optional(),
    endDate: z.string().max(100).optional(),
    subType: z.enum(["biological", "adopted", "stepchild", "unknown"]).optional(),
    note: z.string().max(2000).optional(),
});

module.exports = { createRelationshipSchema, updateRelationshipSchema };
