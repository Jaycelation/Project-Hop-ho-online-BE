const { z } = require("zod");

const createRelationshipSchema = z.object({
    branchId: z.string().min(1, "branchId is required"),
    fromPersonId: z.string().min(1, "fromPersonId is required"),
    toPersonId: z.string().min(1, "toPersonId is required"),
    type: z.enum(["parent_of", "spouse_of", "sibling_of"], {
        errorMap: () => ({ message: "Type must be one of: parent_of, spouse_of, sibling_of" })
    }),
});

const updateRelationshipSchema = z.object({
    type: z.enum(["parent_of", "spouse_of", "sibling_of"], {
        errorMap: () => ({ message: "Type must be one of: parent_of, spouse_of, sibling_of" })
    }),
});

module.exports = { createRelationshipSchema, updateRelationshipSchema };
