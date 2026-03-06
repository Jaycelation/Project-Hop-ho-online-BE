/**
 * importController.js
 * POST /api/branches/:id/import-csv
 *
 * Accepts a CSV file (multipart/form-data field "file") and performs a
 * TWO-PASS import of family data into the given branch.
 *
 * Expected CSV columns (Vietnamese headers from the supplied template):
 *   STT | Họ và tên | Tên gọi khác | Giới tính | Chi - Ngành | Thứ | Ngày sinh
 *   Ngày mất(Âm lịch) | Nơi an táng | Quê quán | Nghề nghiệp
 *   Tên Cha | Tên Mẹ | Vợ/Chồng | Con số 1 | Con số 2 | Con số 3 | ...
 *
 * PASS 1 – Creates Person documents, builds nameMap { normalizedName → ObjectId }
 * PASS 2 – Creates Relationship documents using nameMap lookups
 */

const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const Person = require("../models/PersonModel");
const Relationship = require("../models/RelationshipModel");
const { success, error } = require("../utils/responseHandler");

// ── helpers ──────────────────────────────────────────────────────────────────

/** Normalise a Vietnamese name for fuzzy matching (trim whitespace, lowercase) */
const norm = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

/** Parse a gender string → "male" | "female" | "unknown" */
function parseGender(raw) {
    const s = (raw || "").trim().toLowerCase();
    if (s.includes("nữ") || s === "f" || s === "female") return "female";
    if (s.includes("nam") || s === "m" || s === "male") return "male";
    return "unknown";
}

/**
 * Parse a CSV file and return an array of row objects.
 * Uses csv-parser with { separator: "," } and strips UTF-8 BOM.
 */
function parseCsvFile(filePath) {
    return new Promise((resolve, reject) => {
        const rows = [];
        fs.createReadStream(filePath)
            .pipe(csv({ separator: ",", bom: true }))
            .on("data", (row) => rows.push(row))
            .on("end", () => resolve(rows))
            .on("error", reject);
    });
}

/**
 * Find all columns that look like "Con số N" (child columns).
 */
function childCols(headers) {
    return headers.filter(h => /^con\s*s[oố]\s*\d+$/i.test(h.trim()));
}

// ── Controller ─────────────────────────────────────────────────────────────────
exports.importCsv = async (req, res) => {
    if (!req.file) {
        return error(res, { code: "NO_FILE", message: "No CSV file uploaded" }, 400);
    }

    const branchId = req.params.id;
    const userId = req.user.id || (req.user._id && req.user._id.toString());
    const filePath = req.file.path;

    try {
        // ── PASS 1: Parse CSV → Create Person documents ────────────────────────
        const rows = await parseCsvFile(filePath);
        if (rows.length === 0) {
            return error(res, { code: "EMPTY_CSV", message: "CSV file is empty or has no data rows" }, 422);
        }

        const headers = Object.keys(rows[0]);

        /**
         * nameMap: normalizedName → { _id, fullName, gender }
         * We store by both fullName and otherNames for flexible lookups.
         */
        const nameMap = new Map(); // norm(name) → mongoose ObjectId

        const createdPersons = []; // to reuse in pass 2

        for (const row of rows) {
            // ── Field mapping ──────────────────────────────────────────────────
            const fullName = (row["Họ và tên"] || row["Ho va ten"] || "").trim();
            const otherNames = (row["Tên gọi khác"] || row["Ten goi khac"] || "").trim();
            const genderRaw = (row["Giới tính"] || row["Gioi tinh"] || "").trim();
            const subBranch = (row["Chi - Ngành"] || row["Chi - Nganh"] || "").trim();
            const birthOrderRaw = (row["Thứ"] || row["Thu"] || "").trim();
            const ngaySinh = (row["Ngày sinh"] || row["Ngay sinh"] || "").trim();
            const lunarDateOfDeath = (row["Ngày mất(Âm lịch)"] || row["Ngay mat"] || "").trim();
            const currentAddress = (row["Nơi an táng"] || row["Noi an tang"] || "").trim();
            const hometown = (row["Quê quán"] || row["Que quan"] || "").trim();
            const occupationRaw = (row["Nghề nghiệp"] || row["Nghe nghiep"] || "").trim();

            if (!fullName) continue; // skip blank rows

            // Determine isAlive: "Đã Mất" or "Da Mat" in occupation → deceased
            const isAlive = !/(đã\s*mất|da\s*mat)/i.test(occupationRaw);
            const occupation = isAlive ? occupationRaw : occupationRaw.replace(/(đã\s*mất|da\s*mat)[,;\s]*/gi, "").trim();

            const gender = parseGender(genderRaw);
            const birthOrder = birthOrderRaw ? parseInt(birthOrderRaw, 10) || null : null;

            // Try to parse Gregorian birth year from ngaySinh (format may be "1945" or "1945-01-01")
            let dateOfBirth = null;
            if (ngaySinh) {
                const yearMatch = ngaySinh.match(/\b(1[3-9]\d{2}|2\d{3})\b/);
                if (yearMatch) dateOfBirth = new Date(`${yearMatch[1]}-01-01`);
            }

            // Lunar date of birth — stored as-is (string)
            const lunarDateOfBirth = ngaySinh && /[^\d\-\/]/.test(ngaySinh) ? ngaySinh : "";

            const person = await Person.create({
                branchId,
                fullName,
                otherNames,
                gender,
                dateOfBirth,
                lunarDateOfBirth,
                lunarDateOfDeath,
                isAlive,
                birthOrder,
                subBranch,
                occupation,
                hometown,
                currentAddress,
                createdBy: userId,
            });

            nameMap.set(norm(fullName), person._id);
            if (otherNames) nameMap.set(norm(otherNames), person._id);

            createdPersons.push({ row, personId: person._id });
        }

        // ── PASS 2: Build Relationships ────────────────────────────────────────
        const relErrors = [];
        const childColumns = childCols(headers);

        /**
         * Helper: safely create a relationship, swallowing duplicate conflicts.
         */
        async function safeCreateRel(fromId, toId, type, extras = {}) {
            if (!fromId || !toId) return;
            if (fromId.equals(toId)) return;
            try {
                const exists = await Relationship.findOne({ branchId, fromPersonId: fromId, toPersonId: toId, type });
                if (!exists) {
                    await Relationship.create({ branchId, fromPersonId: fromId, toPersonId: toId, type, ...extras, createdBy: userId });
                }
            } catch (e) {
                if (e.code !== 11000) relErrors.push(e.message); // ignore unique-index duplicates
            }
        }

        for (const { row, personId } of createdPersons) {
            const fatherName = (row["Tên Cha"] || row["Ten Cha"] || "").trim();
            const motherName = (row["Tên Mẹ"] || row["Ten Me"] || "").trim();
            const spouseName = (row["Vợ/Chồng"] || row["Vo/Chong"] || "").trim();

            // Parent_of: father → child
            if (fatherName) {
                const fatherId = nameMap.get(norm(fatherName));
                await safeCreateRel(fatherId, personId, "parent_of", { subType: "biological" });
            }

            // Parent_of: mother → child
            if (motherName) {
                const motherId = nameMap.get(norm(motherName));
                await safeCreateRel(motherId, personId, "parent_of", { subType: "biological" });
            }

            // Spouse_of (bidirectional — create both directions if not exist)
            if (spouseName) {
                const spouseId = nameMap.get(norm(spouseName));
                await safeCreateRel(personId, spouseId, "spouse_of", { status: "married" });
                await safeCreateRel(spouseId, personId, "spouse_of", { status: "married" });
            }

            // Children: columns "Con số 1", "Con số 2", etc.
            for (const col of childColumns) {
                const childName = (row[col] || "").trim();
                if (!childName) continue;
                const childId = nameMap.get(norm(childName));
                // parent_of: current person → child
                await safeCreateRel(personId, childId, "parent_of", { subType: "biological" });
            }
        }

        // ── Cleanup uploaded temp file ─────────────────────────────────────────
        try { fs.unlinkSync(filePath); } catch (_) { }

        return success(res, {
            message: `Import thành công ${createdPersons.length} thành viên`,
            personsCreated: createdPersons.length,
            relErrors: relErrors.length > 0 ? relErrors : undefined,
        }, null, 201);

    } catch (err) {
        // Cleanup on fatal error
        try { fs.unlinkSync(filePath); } catch (_) { }
        console.error("[importCsv] Fatal error:", err);
        return error(res, err);
    }
};
