const { error } = require("../utils/responseHandler");
const fs = require("fs");

const errorHandler = (err, req, res, next) => {
    console.error(err.stack);

    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        try {
            fs.unlinkSync(req.file.path);
            console.log("Cleanup file rác thành công:", req.file.path);
        } catch (unlinkErr) {
            console.error("Lỗi xóa file rác:", unlinkErr);
        }
    }

    const errorResponse = {
        code: err.code || "INTERNAL_SERVER_ERROR",
        message: err.message || "Something went wrong",
        details: err.details || null,
    };

    const status = err.status || 500;
    return error(res, errorResponse, status);
};

module.exports = errorHandler;