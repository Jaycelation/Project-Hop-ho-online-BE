// Using dynamic import because @dqcai/vn-lunar is an ESM-only package
let lunarLib = null;

async function getLunarLib() {
    if (!lunarLib) {
        // Dynamic import returns a promise
        const module = await import("@dqcai/vn-lunar");
        lunarLib = module.default || module;
    }
    return lunarLib;
}

/**
 * Convert Solar Date to Vietnamese Lunar Date
 * @param {Date|string} date Solar date
 * @returns {Promise<object>} { day, month, year, isLeap, canChiYear, canChiMonth, canChiDay, label }
 */
const solarToLunar = async (date) => {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;

    const { LunarCalendar } = await getLunarLib();
    const calendar = LunarCalendar.fromSolar(d.getDate(), d.getMonth() + 1, d.getFullYear());
    const lunar = calendar.lunarDate;

    return {
        day: lunar.day,
        month: lunar.month,
        year: lunar.year,
        isLeap: lunar.leap,
        canChiYear: calendar.yearCanChi,
        canChiMonth: calendar.monthCanChi,
        canChiDay: calendar.dayCanChi,
        label: calendar.formatLunar()
    };
};

/**
 * Convert Lunar Date to Solar Date
 * @param {number} day 
 * @param {number} month 
 * @param {number} year 
 * @param {boolean} isLeap 
 * @returns {Promise<Date>} Solar Date
 */
const lunarToSolar = async (day, month, year, isLeap = false) => {
    try {
        const { LunarCalendar } = await getLunarLib();
        const calendar = LunarCalendar.fromLunar(day, month, year, isLeap);
        const solar = calendar.solarDate;
        return new Date(solar.year, solar.month - 1, solar.day);
    } catch (error) {
        return null;
    }
};

module.exports = {
    solarToLunar,
    lunarToSolar
};
