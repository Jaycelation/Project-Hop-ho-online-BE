"use strict";
/**
 * exportController.js
 * Translated from giapha-os/utils/gedcom.ts and giapha-os/utils/csv.ts
 *
 * Adaptation notes:
 *  - giapha-os uses JSZip browser-side for CSV; we use Node's built-in `archiver`
 *    to stream a .zip of persons.csv + relationships.csv directly to the HTTP response.
 *  - GEDCOM 7.0 spec faithfully ported from giapha-os (header, INDI, FAM records, TRLR).
 *  - PersonModel fields: fullName, gender, dateOfBirth, dateOfDeath, note, generation
 *    → decomposed to year/month/day integer parts for GEDCOM DATE formatting.
 *  - RelationshipModel fields: type ("parent_of"|"spouse_of"), fromPersonId, toPersonId
 *    → mapped to GEDCOM HUSB/WIFE/CHIL structure via the same family-building logic.
 */

const Person = require("../models/PersonModel");
const Relationship = require("../models/RelationshipModel");
const archiver = require("archiver");
const { success, error } = require("../utils/responseHandler");

// ── GEDCOM helpers ────────────────────────────────────────────────────────────

const MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function getMonthName(m) {
    if (!m || m < 1 || m > 12) return "";
    return MONTH_NAMES[m - 1];
}

/**
 * Format a JS Date into a GEDCOM date string: "DD MON YYYY"
 * Missing parts are omitted (e.g., only year → "1985")
 */
function formatGedcomDate(date) {
    if (!date) return null;
    const d = new Date(date);
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const parts = [
        String(day).padStart(2, "0"),
        getMonthName(month),
        String(year),
    ].filter(Boolean);
    return parts.join(" ");
}

/**
 * Sanitize a MongoDB ObjectId string for GEDCOM tag (remove hyphens/special chars).
 */
function gedId(id) {
    return String(id).replace(/[^a-zA-Z0-9]/g, "");
}

// ── GEDCOM export ─────────────────────────────────────────────────────────────

function buildGedcom(persons, relationships) {
    let gedcom = "";

    // Header (GEDCOM 7.0)
    gedcom += "0 HEAD\n";
    gedcom += "1 GEDC\n";
    gedcom += "2 VERS 7.0\n";
    gedcom += "1 SOUR GiaPhaMERN\n";
    gedcom += "2 NAME Gia Pha Online\n";
    gedcom += "2 VERS 1.0.0\n";
    gedcom += "1 CHAR UTF-8\n";

    const personMap = new Map(persons.map((p) => [String(p._id), p]));

    // Export Individuals
    for (const person of persons) {
        const pid = gedId(person._id);
        gedcom += `0 @I${pid}@ INDI\n`;

        // Name
        const name = (person.fullName || "Unknown").trim();
        const parts = name.split(" ");
        const lastName = parts.length > 1 ? parts.pop() : "";
        const firstName = parts.join(" ");
        gedcom += `1 NAME ${firstName} /${lastName}/\n`;

        // Sex
        if (person.gender === "male") gedcom += "1 SEX M\n";
        else if (person.gender === "female") gedcom += "1 SEX F\n";
        else gedcom += "1 SEX U\n";

        // Birth
        if (person.dateOfBirth) {
            gedcom += "1 BIRT\n";
            const dateStr = formatGedcomDate(person.dateOfBirth);
            if (dateStr) gedcom += `2 DATE ${dateStr}\n`;
        }

        // Death
        if (person.dateOfDeath) {
            gedcom += "1 DEAT Y\n";
            const dateStr = formatGedcomDate(person.dateOfDeath);
            if (dateStr) gedcom += `2 DATE ${dateStr}\n`;
        }

        // Generation (custom tag)
        if (person.generation != null) {
            gedcom += `1 _GEN ${person.generation}\n`;
        }

        // Note
        if (person.note) {
            const lines = person.note.split("\n");
            gedcom += `1 NOTE ${lines[0]}\n`;
            for (let i = 1; i < lines.length; i++) {
                gedcom += `2 CONT ${lines[i]}\n`;
            }
        }
    }

    // Build family groups from relationships
    const marriages = relationships.filter((r) => r.type === "spouse_of");
    const parentRels = relationships.filter((r) => r.type === "parent_of");

    const families = [];
    let familyCounter = 1;

    for (const marriage of marriages) {
        const pA = personMap.get(String(marriage.fromPersonId));
        const pB = personMap.get(String(marriage.toPersonId));
        if (!pA || !pB) continue;
        const fam = {
            id: `F${familyCounter++}`,
            husb: pA.gender === "male" ? String(pA._id) : (pB.gender === "male" ? String(pB._id) : String(pA._id)),
            wife: pA.gender === "female" ? String(pA._id) : (pB.gender === "female" ? String(pB._id) : String(pB._id)),
            children: [],
        };
        families.push(fam);
    }

    // Assign children to families
    for (const rel of parentRels) {
        const parentId = String(rel.fromPersonId);
        const childId = String(rel.toPersonId);
        let fam = families.find((f) => f.husb === parentId || f.wife === parentId);
        if (!fam) {
            const parent = personMap.get(parentId);
            if (!parent) continue;
            fam = {
                id: `F${familyCounter++}`,
                husb: parent.gender === "male" ? parentId : undefined,
                wife: parent.gender === "female" ? parentId : undefined,
                children: [],
            };
            families.push(fam);
        }
        if (!fam.children.includes(childId)) fam.children.push(childId);
    }

    // Export Families
    for (const fam of families) {
        gedcom += `0 @${fam.id}@ FAM\n`;
        if (fam.husb) gedcom += `1 HUSB @I${gedId(fam.husb)}@\n`;
        if (fam.wife) gedcom += `1 WIFE @I${gedId(fam.wife)}@\n`;
        for (const childId of fam.children) {
            gedcom += `1 CHIL @I${gedId(childId)}@\n`;
        }
    }

    gedcom += "0 TRLR\n";
    return gedcom;
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function escapeCsv(val) {
    if (val == null) return "";
    const s = String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

function rowsToCsv(rows, columns) {
    const header = columns.join(",");
    const lines = rows.map((row) =>
        columns.map((col) => escapeCsv(row[col])).join(",")
    );
    return [header, ...lines].join("\n");
}

function personsToRows(persons) {
    return persons.map((p) => ({
        _id: String(p._id),
        fullName: p.fullName || "",
        gender: p.gender || "",
        dateOfBirth: p.dateOfBirth ? new Date(p.dateOfBirth).toISOString().split("T")[0] : "",
        dateOfDeath: p.dateOfDeath ? new Date(p.dateOfDeath).toISOString().split("T")[0] : "",
        generation: p.generation ?? "",
        privacy: p.privacy || "",
        note: (p.note || "").replace(/\n/g, " "),
        branchId: String(p.branchId),
    }));
}

function relsToRows(rels) {
    return rels.map((r) => ({
        _id: String(r._id),
        type: r.type || "",
        fromPersonId: String(r.fromPersonId),
        toPersonId: String(r.toPersonId),
        branchId: String(r.branchId),
        note: (r.note || "").replace(/\n/g, " "),
    }));
}

// ── Controller methods ────────────────────────────────────────────────────────

/**
 * GET /api/branches/:id/export/gedcom
 * Returns a downloadable .ged file for the entire branch.
 */
exports.exportGedcom = async (req, res) => {
    try {
        const branchId = req.params.id;
        const [persons, relationships] = await Promise.all([
            Person.find({ branchId }).lean(),
            Relationship.find({ branchId }).lean(),
        ]);

        const gedcom = buildGedcom(persons, relationships);

        res.setHeader("Content-Type", "application/x-gedcom");
        res.setHeader("Content-Disposition", `attachment; filename="branch_${branchId}.ged"`);
        return res.status(200).send(gedcom);
    } catch (err) {
        return error(res, err);
    }
};

/**
 * GET /api/branches/:id/export/csv
 * Returns a .zip archive containing persons.csv and relationships.csv.
 * Translated from giapha-os/utils/csv.ts (JSZip → Node archiver).
 */
exports.exportCsv = async (req, res) => {
    try {
        const branchId = req.params.id;
        const [persons, relationships] = await Promise.all([
            Person.find({ branchId }).lean(),
            Relationship.find({ branchId }).lean(),
        ]);

        const personsCsv = rowsToCsv(personsToRows(persons), [
            "_id", "fullName", "gender", "dateOfBirth", "dateOfDeath", "generation", "privacy", "note", "branchId"
        ]);
        const relsCsv = rowsToCsv(relsToRows(relationships), [
            "_id", "type", "fromPersonId", "toPersonId", "branchId", "note"
        ]);

        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="branch_${branchId}_export.zip"`);

        const archive = archiver("zip", { zlib: { level: 9 } });
        archive.on("error", (err) => { throw err; });
        archive.pipe(res);
        archive.append(personsCsv, { name: "persons.csv" });
        archive.append(relsCsv, { name: "relationships.csv" });
        await archive.finalize();
    } catch (err) {
        return error(res, err);
    }
};
