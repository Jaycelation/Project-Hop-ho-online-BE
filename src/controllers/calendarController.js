const Person = require("../models/PersonModel");
const Event = require("../models/EventModel");
const { success, error } = require("../utils/responseHandler");
const { solarToLunar } = require("../utils/lunarHelper");

/**
 * Convert Solar to Lunar
 */
exports.convertSolarToLunar = async (req, res, next) => {
    try {
        const { date } = req.query;
        if (!date) return error(res, { code: "MISSING_DATE", message: "Date is required" }, 400);

        const lunar = await solarToLunar(date);
        if (!lunar) return error(res, { code: "INVALID_DATE", message: "Invalid solar date" }, 400);

        return success(res, lunar);
    } catch (err) {
        next(err);
    }
};

/**
 * Get Lunar Events (Anniversaries & General Events) in a Lunar Month
 */
exports.getLunarAnniversaries = async (req, res, next) => {
    try {
        const { month } = req.query;
        if (!month) return error(res, { code: "MISSING_MONTH", message: "Lunar month is required" }, 400);

        const lMonth = parseInt(month);

        // 1. Fetch Anniversaries from Person model
        const deadPersons = await Person.find({
            "lunarDeathDate.month": lMonth
        }).select("fullName lunarDeathDate branchId gender");

        const personEvents = deadPersons.map(p => ({
            id: p._id,
            type: "death",
            title: `Giỗ: ${p.fullName}`,
            lunarDay: p.lunarDeathDate?.day,
            lunarMonth: p.lunarDeathDate?.month,
            branchId: p.branchId
        }));

        // 2. Fetch from Event model
        const events = await Event.find({
            "lunarEventDate.month": lMonth,
            status: "approved"
        }).select("title lunarEventDate eventDate branchId type");

        const generalEvents = events.map(e => ({
            id: e._id,
            type: e.type || "other",
            title: e.title,
            lunarDay: e.lunarEventDate?.day,
            lunarMonth: e.lunarEventDate?.month,
            solarDay: e.eventDate ? e.eventDate.getDate() : null,
            solarMonth: e.eventDate ? e.eventDate.getMonth() + 1 : null,
            branchId: e.branchId
        }));

        const allEvents = [...personEvents, ...generalEvents].sort((a, b) => a.lunarDay - b.lunarDay);

        return success(res, allEvents);
    } catch (err) {
        next(err);
    }
};

/**
 * Get Lunar Birthdays in a Month
 */
exports.getLunarBirthdays = async (req, res, next) => {
    try {
        const { month } = req.query;
        if (!month) return error(res, { code: "MISSING_MONTH", message: "Lunar month is required" }, 400);

        const lMonth = parseInt(month);

        const persons = await Person.find({
            "lunarBirthDate.month": lMonth
        }).select("fullName lunarBirthDate dateOfBirth branchId gender");

        const mapped = persons.map(p => ({
            id: p._id,
            type: "birth",
            title: `Sinh nhật: ${p.fullName}`,
            solarDay: p.dateOfBirth ? p.dateOfBirth.getDate() : null,
            solarMonth: p.dateOfBirth ? p.dateOfBirth.getMonth() + 1 : null,
            lunarDay: p.lunarBirthDate?.day,
            lunarMonth: p.lunarBirthDate?.month,
            branchId: p.branchId
        })).sort((a, b) => a.lunarDay - b.lunarDay);

        return success(res, mapped);
    } catch (err) {
        next(err);
    }
};
