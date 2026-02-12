const express = require("express");
const router = express.Router();
const { success } = require("../utils/responseHandler");

router.get("/health", (req, res) => {
    return success(res, { status: "ok", timestamp: new Date() });
});

module.exports = router;
