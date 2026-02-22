const { error } = require("../utils/responseHandler");

/**
 * Zod validation middleware factory
 * @param {import("zod").ZodSchema} schema - Zod schema to validate against
 * @param {"body"|"query"|"params"} source - Which part of the request to validate
 */
const validate = (schema, source = "body") => {
    return (req, res, next) => {
        const result = schema.safeParse(req[source]);
        if (!result.success) {
            const formatted = result.error.issues.map(issue => ({
                field: issue.path.join("."),
                message: issue.message
            }));
            return error(res, {
                code: "VALIDATION_ERROR",
                message: "Invalid input data",
                details: formatted
            }, 400);
        }
        // Replace with parsed (coerced/transformed) data
        req[source] = result.data;
        next();
    };
};

module.exports = validate;
