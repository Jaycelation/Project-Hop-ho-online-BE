/**
 * Standardize API Response
 * @param {Object} res - Express response object
 * @param {number} status - HTTP status code
 * @param {boolean} success - Success flag
 * @param {Object} data - Payload data
 * @param {Object} meta - Pagination or extra metadata
 * @param {string} error - Error message or object
 */
const sendResponse = (res, status, success, data = null, meta = null, error = null) => {
    const response = { success };
    if (data !== null && data !== undefined) response.data = data;
    if (meta !== null && meta !== undefined) response.meta = meta;
    if (error !== null && error !== undefined) response.error = error;

    return res.status(status).json(response);
};

exports.success = (res, data, meta = null, status = 200) => {
    return sendResponse(res, status, true, data, meta);
};

exports.error = (res, error, status = 500) => {
    return sendResponse(res, status, false, null, null, error);
};
