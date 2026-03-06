"use strict";
/**
 * dateHelpers.js
 * Translated from giapha-os/utils/dateHelpers.ts
 *
 * Adaptation notes for MERN stack:
 *  - giapha-os stores year/month/day as separate integers on the Person row.
 *  - Our PersonModel stores dateOfBirth / dateOfDeath as JS Date objects.
 *  - We decompose the JS Date → (year, month, day) before calling Solar.fromYmd().
 *  - All public functions accept either a JS Date OR (year, month, day) integers.
 */

const { Solar } = require("lunar-javascript");

// ─── Core converters ─────────────────────────────────────────────────────────

/**
 * Format a date for display as DD/MM/YYYY (Vietnamese convention).
 * Accepts a JS Date or separate (year, month, day) integers.
 */
function formatDisplayDate(yearOrDate, month = null, day = null) {
    let y = yearOrDate, m = month, d = day;
    if (yearOrDate instanceof Date) {
        y = yearOrDate.getFullYear();
        m = yearOrDate.getMonth() + 1;
        d = yearOrDate.getDate();
    }
    if (!y && !m && !d) return "Chưa rõ";
    const parts = [];
    if (d) parts.push(String(d).padStart(2, "0"));
    if (m) parts.push(String(m).padStart(2, "0"));
    if (y) parts.push(String(y));
    return parts.join("/");
}

/**
 * Convert a solar date to its Vietnamese lunar date string.
 * Returns null if any date component is missing or conversion fails.
 *
 * @param {Date|number} yearOrDate  - JS Date object, OR year integer
 * @param {number|null} month       - Month (1–12), used when yearOrDate is a number
 * @param {number|null} day         - Day (1–31), used when yearOrDate is a number
 * @returns {string|null}           e.g. "15/01 nhuận/2024" or "03/07/1985"
 */
function getLunarDateString(yearOrDate, month = null, day = null) {
    let y = yearOrDate, m = month, d = day;
    if (yearOrDate instanceof Date) {
        y = yearOrDate.getFullYear();
        m = yearOrDate.getMonth() + 1;
        d = yearOrDate.getDate();
    }
    if (!y || !m || !d) return null;

    try {
        const solar = Solar.fromYmd(parseInt(y), parseInt(m), parseInt(d));
        const lunar = solar.getLunar();

        const lDay = String(lunar.getDay()).padStart(2, "0");
        const lMonthRaw = lunar.getMonth();
        const isLeap = lMonthRaw < 0;
        const lMonth = String(Math.abs(lMonthRaw)).padStart(2, "0");
        const lYear = lunar.getYear();

        return `${lDay}/${lMonth}${isLeap ? " nhuận" : ""}/${lYear}`;
    } catch (err) {
        console.error("Lunar conversion error:", err.message);
        return null;
    }
}

/**
 * Get the lunar year's can-chi (zodiac animal) name.
 * e.g. year 1985 → "Sửu"
 */
function getZodiacAnimal(yearOrDate, month = null, day = null) {
    let y = yearOrDate, m = month, d = day;
    if (yearOrDate instanceof Date) {
        y = yearOrDate.getFullYear();
        m = yearOrDate.getMonth() + 1;
        d = yearOrDate.getDate();
    }
    if (!y) return null;

    const animals = ["Thân", "Dậu", "Tuất", "Hợi", "Tý", "Sửu", "Dần", "Mão", "Thìn", "Tỵ", "Ngọ", "Mùi"];
    let targetYear = y;

    // Try to get the actual lunar year (birth before Tết → previous lunar year)
    if (m && d) {
        try {
            const solar = Solar.fromYmd(parseInt(y), parseInt(m), parseInt(d));
            targetYear = solar.getLunar().getYear();
        } catch (_) { /* fallback to solar year */ }
    }
    return animals[targetYear % 12];
}

/**
 * Get the Western zodiac constellation for a given day/month.
 */
function getZodiacSign(dayOrDate, month = null) {
    let d = dayOrDate, m = month;
    if (dayOrDate instanceof Date) {
        d = dayOrDate.getDate();
        m = dayOrDate.getMonth() + 1;
    }
    if (!d || !m) return null;

    if ((m === 3 && d >= 21) || (m === 4 && d <= 19)) return "Bạch Dương";
    if ((m === 4 && d >= 20) || (m === 5 && d <= 20)) return "Kim Ngưu";
    if ((m === 5 && d >= 21) || (m === 6 && d <= 21)) return "Song Tử";
    if ((m === 6 && d >= 22) || (m === 7 && d <= 22)) return "Cự Giải";
    if ((m === 7 && d >= 23) || (m === 8 && d <= 22)) return "Sư Tử";
    if ((m === 8 && d >= 23) || (m === 9 && d <= 22)) return "Xử Nữ";
    if ((m === 9 && d >= 23) || (m === 10 && d <= 23)) return "Thiên Bình";
    if ((m === 10 && d >= 24) || (m === 11 && d <= 21)) return "Thiên Yết";
    if ((m === 11 && d >= 22) || (m === 12 && d <= 21)) return "Nhân Mã";
    if ((m === 12 && d >= 22) || (m === 1 && d <= 19)) return "Ma Kết";
    if ((m === 1 && d >= 20) || (m === 2 && d <= 18)) return "Bảo Bình";
    if ((m === 2 && d >= 19) || (m === 3 && d <= 20)) return "Song Ngư";
    return null;
}

/**
 * Calculate age in years. Returns { age, isDeceased } or null if no birthYear.
 */
function calculateAge(dateOfBirth, dateOfDeath = null) {
    if (!dateOfBirth) return null;
    const birthYear = dateOfBirth instanceof Date ? dateOfBirth.getFullYear() : dateOfBirth;
    if (dateOfDeath) {
        const deathYear = dateOfDeath instanceof Date ? dateOfDeath.getFullYear() : dateOfDeath;
        return { age: deathYear - birthYear, isDeceased: true };
    }
    return { age: new Date().getFullYear() - birthYear, isDeceased: false };
}

// ─── Helper for controller: enrich a person plain-object with lunar fields ───

/**
 * Takes a Mongoose person document (or plain object) and appends derived
 * lunar/zodiac virtual fields. Does NOT mutate the DB document.
 *
 * Returns a plain JS object with extra fields:
 *   lunarDateOfBirth, lunarDateOfDeath, zodiacSign, zodiacAnimal, ageInfo
 */
function appendLunarDates(personDoc) {
    const obj = typeof personDoc.toObject === "function" ? personDoc.toObject() : { ...personDoc };

    obj.lunarDateOfBirth = getLunarDateString(obj.dateOfBirth);
    obj.lunarDateOfDeath = getLunarDateString(obj.dateOfDeath);
    obj.zodiacSign = getZodiacSign(obj.dateOfBirth);
    obj.zodiacAnimal = getZodiacAnimal(obj.dateOfBirth);
    obj.ageInfo = calculateAge(obj.dateOfBirth, obj.dateOfDeath);

    return obj;
}

module.exports = {
    formatDisplayDate,
    getLunarDateString,
    getZodiacAnimal,
    getZodiacSign,
    calculateAge,
    appendLunarDates,
};
