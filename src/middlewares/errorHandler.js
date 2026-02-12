const { error } = require("../utils/responseHandler");

const errorHandler = (err, req, res, next) => {
    console.error(err.stack);

    // Default error structure
    const errorResponse = {
        code: err.code || "INTERNAL_SERVER_ERROR",
        message: err.message || "Something went wrong",
        details: err.details || null,
    };

    const status = err.status || 500;
    return error(res, errorResponse, status);
};

module.exports = errorHandler;
