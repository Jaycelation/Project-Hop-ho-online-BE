const express = require("express");
const router = express.Router();
const calendarController = require("../controllers/calendarController");
const { verifyToken } = require("../middlewares/authMiddleware");

// Convert Solar to Lunar
router.get("/convert/solar-to-lunar", verifyToken, calendarController.convertSolarToLunar);

// Get Anniversaries (Ngày giỗ) by Lunar Month
router.get("/anniversaries", verifyToken, calendarController.getLunarAnniversaries);

// Get Lunar Birthdays
router.get("/birthdays", verifyToken, calendarController.getLunarBirthdays);

module.exports = router;