const sendResponse = (res, status, success, data = null, meta = null, error = null) => {
    const response = { success };
    if (data !== null && data !== undefined) response.data = data;
    if (meta !== null && meta !== undefined) response.meta = meta;
    if (error !== null && error !== undefined) response.error = error;
    try {
        // Also log the first 200 chars if it's an error
        if (!success) {
            console.error('\n==== API ERROR ENCOUNTERED ====');
            if (error instanceof Error) {
                console.error('Stack:', error.stack);
                response.error = { message: error.message }; // Clean it for output
            } else {
                console.error('Error Object:', error);
            }
        }
        return res.status(status).json(response);
    } catch (stringifyError) {
        console.error('\n==== RES.JSON STRINGIFY ERROR ====', stringifyError.stack);
        return res.status(500).json({ success: false, error: 'Circular or Invalid JSON structure' });
    }
};

exports.success = (res, data, meta = null, status = 200) => {
    return sendResponse(res, status, true, data, meta);
};

exports.error = (res, error, status = 500) => {
    return sendResponse(res, status, false, null, null, error);
};
