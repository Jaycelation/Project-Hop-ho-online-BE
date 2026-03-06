"use strict";
/**
 * kinshipHelpers.js
 * Translated from giapha-os/utils/kinshipHelpers.ts
 *
 * Algorithm: BFS from each person up the parent tree to find
 * the Lowest Common Ancestor (LCA). Then resolveBloodTerms()
 * determines the Vietnamese kinship title based on the depths
 * and gender of people along the path.
 *
 * Adaptation notes for MERN stack:
 *  - giapha-os PersonNode uses snake_case (full_name, birth_year, birth_order, is_in_law)
 *  - Our PersonModel uses camelCase (fullName, dateOfBirth, generation)
 *  - Our RelationshipModel uses types: "parent_of" | "spouse_of" (not "biological_child" | "marriage")
 *  - normalizePersons() and normalizeRelationships() bridge this gap.
 */

// ── Vietnamese Terminology Constants ─────────────────────────────────────────

const ANCESTORS = ["", "Bố/Mẹ", "Ông/Bà", "Cụ", "Kỵ", "Sơ", "Tiệm", "Tiểu", "Di", "Diễn"];
const DESCENDANTS = ["", "Con", "Cháu", "Chắt", "Chít", "Chút", "Chét", "Chót", "Chẹt"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function compareSeniority(a, b) {
    if (a.id === b.id) return "equal";
    if (a.birth_order != null && b.birth_order != null) {
        if (a.birth_order < b.birth_order) return "senior";
        if (a.birth_order > b.birth_order) return "junior";
    }
    if (a.birth_year != null && b.birth_year != null) {
        if (a.birth_year < b.birth_year) return "senior";
        if (a.birth_year > b.birth_year) return "junior";
    }
    return "equal";
}

function getDirectAncestorTerm(depth, gender, isPaternal) {
    if (depth === 1) return gender === "female" ? "Mẹ" : "Bố";
    if (depth === 2) {
        const base = gender === "female" ? "Bà" : "Ông";
        return `${base} ${isPaternal ? "nội" : "ngoại"}`;
    }
    if (depth === 3) {
        const base = gender === "female" ? "Cụ bà" : "Cụ ông";
        return `${base} ${isPaternal ? "nội" : "ngoại"}`;
    }
    return ANCESTORS[depth] || `Tổ đời ${depth}`;
}

function getDirectDescendantTerm(depth) {
    return DESCENDANTS[depth] || `Cháu đời ${depth}`;
}

// ── Core resolver (mirrors resolveBloodTerms from giapha-os exactly) ─────────

function resolveBloodTerms(depthA, depthB, personA, personB, pathA, pathB) {
    const genderA = personA.gender;
    const genderB = personB.gender;

    // 1. Direct lineage: A is LCA
    if (depthA === 0) {
        const firstChildOfA = pathB[pathB.length - 1];
        if (!firstChildOfA) return ["Hậu duệ", "Tiền bối", "Quan hệ Trực hệ"];
        const isPaternal = firstChildOfA.gender === "male";
        const bCallsA = getDirectAncestorTerm(depthB, genderA, isPaternal);
        const aCallsB = getDirectDescendantTerm(depthB);
        return [aCallsB, bCallsA, "Quan hệ Trực hệ"];
    }

    // 2. Direct lineage: B is LCA
    if (depthB === 0) {
        const firstChildOfB = pathA[pathA.length - 1];
        if (!firstChildOfB) return ["Tiền bối", "Hậu duệ", "Quan hệ Trực hệ"];
        const isPaternal = firstChildOfB.gender === "male";
        const aCallsB = getDirectAncestorTerm(depthA, genderB, isPaternal);
        const bCallsA = getDirectDescendantTerm(depthA);
        return [aCallsB, bCallsA, "Quan hệ Trực hệ"];
    }

    // 3. Collateral (siblings, uncle/aunt, cousins…)
    const branchA = pathA[pathA.length - 1];
    const branchB = pathB[pathB.length - 1];
    if (!branchA || !branchB) return ["Họ hàng", "Họ hàng", "Quan hệ họ hàng"];

    const seniority = compareSeniority(branchA, branchB);
    const isPaternalA = branchA.gender === "male";

    // Siblings (same parents)
    if (depthA === 1 && depthB === 1) {
        const aSenior = compareSeniority(personA, personB);
        if (aSenior === "senior") {
            return [
                genderB === "female" ? "Em gái" : "Em trai",
                genderA === "female" ? "Chị gái" : "Anh trai",
                "Anh chị em ruột",
            ];
        } else {
            return [
                genderB === "female" ? "Chị gái" : "Anh trai",
                genderA === "female" ? "Em gái" : "Em trai",
                "Anh chị em ruột",
            ];
        }
    }

    // Uncle/Aunt/Niece/Nephew
    if (depthA > 1 && depthB === 1) {
        let termForB = "";
        const isPaternalSide = branchA.gender === "male";
        if (isPaternalSide) {
            if (genderB === "female") termForB = "Cô";
            else termForB = seniority === "junior" ? "Bác" : "Chú";
        } else {
            termForB = genderB === "female" ? "Dì" : "Cậu";
        }
        let prefix = "";
        if (depthA === 3) prefix = genderB === "female" ? "Bà " : "Ông ";
        else if (depthA === 4) prefix = genderB === "female" ? "Cụ bà " : "Cụ ông ";
        else if (depthA > 4) prefix = ANCESTORS[depthA - 1] + " ";
        return [
            (prefix + termForB).trim(),
            getDirectDescendantTerm(depthA),
            isPaternalSide ? "Bên Nội (Vế trên)" : "Bên Ngoại (Vế trên)",
        ];
    }

    // Reverse uncle/aunt
    if (depthA === 1 && depthB > 1) {
        const [bCallsA, aCallsB, desc] = resolveBloodTerms(depthB, depthA, personB, personA, pathB, pathA);
        return [aCallsB, bCallsA, desc];
    }

    // Cousins / distant relatives
    if (depthA > 1 && depthB > 1) {
        const side = isPaternalA ? "Nội" : "Ngoại";
        if (depthA === depthB) {
            if (seniority === "senior") {
                return ["Em họ", genderA === "female" ? "Chị họ" : "Anh họ", `Anh em họ ${side}`];
            } else {
                return [genderB === "female" ? "Chị họ" : "Anh họ", "Em họ", `Anh em họ ${side}`];
            }
        } else {
            const genDiff = depthA - depthB;
            if (genDiff > 0) {
                let termForB = "Họ hàng";
                if (genDiff === 1) {
                    if (branchA.gender === "male") {
                        termForB = genderB === "female" ? "Cô họ" : seniority === "junior" ? "Bác họ" : "Chú họ";
                    } else {
                        termForB = genderB === "female" ? "Dì họ" : "Cậu họ";
                    }
                } else {
                    termForB = genderB === "female" ? "Bà họ" : "Ông họ";
                }
                return [termForB, "Cháu họ", `Họ hàng ${side}`];
            } else {
                const [bCallsA, aCallsB, desc] = resolveBloodTerms(depthB, depthA, personB, personA, pathB, pathA);
                return [aCallsB, bCallsA, desc];
            }
        }
    }

    return ["Người trong họ", "Người trong họ", "Quan hệ họ hàng"];
}

// ── BFS ancestry traversal ────────────────────────────────────────────────────

function getAncestryData(id, parentMap, personsMap) {
    const depths = new Map();
    const queue = [{ id, depth: 0, path: [] }];
    while (queue.length > 0) {
        const { id: currentId, depth, path } = queue.shift();
        if (!depths.has(currentId)) {
            depths.set(currentId, { depth, path });
            const currentNode = personsMap.get(currentId);
            if (!currentNode) continue;
            const parents = parentMap.get(currentId) || [];
            for (const pId of parents) {
                const pNode = personsMap.get(pId);
                if (pNode) {
                    queue.push({ id: pId, depth: depth + 1, path: [...path, currentNode] });
                }
            }
        }
    }
    return depths;
}

function findBloodKinship(personA, personB, personsMap, parentMap) {
    const ancA = getAncestryData(personA.id, parentMap, personsMap);
    const ancB = getAncestryData(personB.id, parentMap, personsMap);

    let lcaId = null;
    let minDistance = Infinity;
    for (const [id, dataA] of ancA) {
        if (ancB.has(id)) {
            const dist = dataA.depth + ancB.get(id).depth;
            if (dist < minDistance) { minDistance = dist; lcaId = id; }
        }
    }
    if (!lcaId) return null;

    const dataA = ancA.get(lcaId);
    const dataB = ancB.get(lcaId);
    const [aCallsB, bCallsA, description] = resolveBloodTerms(
        dataA.depth, dataB.depth, personA, personB, dataA.path, dataB.path
    );
    const lcaName = personsMap.get(lcaId)?.full_name || "Tổ tiên chung";
    return {
        aCallsB, bCallsA,
        description: `${description} (Tổ tiên chung: ${lcaName})`,
        distance: minDistance,
        pathLabels: [
            `${personA.full_name} cách ${lcaName} ${dataA.depth} đời.`,
            `${personB.full_name} cách ${lcaName} ${dataB.depth} đời.`,
        ],
    };
}

// ── MERN normalization helpers ─────────────────────────────────────────────────

/**
 * Convert a Mongoose Person document to the PersonNode shape expected by the algorithm.
 */
function normalizePerson(doc) {
    const obj = typeof doc.toObject === "function" ? doc.toObject() : doc;
    return {
        id: String(obj._id),
        full_name: obj.fullName || "Chưa xác định",
        gender: obj.gender || "other",
        birth_year: obj.dateOfBirth ? new Date(obj.dateOfBirth).getFullYear() : null,
        birth_order: obj.birthOrder || null,
        generation: obj.generation || null,
        is_in_law: obj.isInLaw || false,
    };
}

/**
 * Convert a Mongoose Relationship document to the algorithm's RelEdge shape.
 * MERN uses: "parent_of" (fromPersonId → toPersonId) and "spouse_of"
 * Algorithm expects: "biological_child" (person_a=parent, person_b=child) and "marriage"
 */
function normalizeRelationship(doc) {
    const obj = typeof doc.toObject === "function" ? doc.toObject() : doc;
    const type = obj.type === "parent_of" ? "biological_child"
        : obj.type === "spouse_of" ? "marriage"
            : obj.type;
    return {
        type,
        person_a: String(obj.fromPersonId),
        person_b: String(obj.toPersonId),
    };
}

// ── Main Entry Point ───────────────────────────────────────────────────────────

/**
 * Compute Vietnamese kinship between two persons.
 *
 * @param {Object} personADoc - Mongoose Person document (or plain object)
 * @param {Object} personBDoc - Mongoose Person document (or plain object)
 * @param {Object[]} allPersonDocs - All persons in the branch
 * @param {Object[]} allRelDocs   - All relationships in the branch
 * @returns {KinshipResult}
 */
function computeKinship(personADoc, personBDoc, allPersonDocs, allRelDocs) {
    const personA = normalizePerson(personADoc);
    const personB = normalizePerson(personBDoc);
    if (personA.id === personB.id) return null;

    const persons = allPersonDocs.map(normalizePerson);
    const relationships = allRelDocs.map(normalizeRelationship);

    const personsMap = new Map(persons.map((p) => [p.id, p]));
    const parentMap = new Map();
    const spouseMap = new Map();

    for (const r of relationships) {
        if (r.type === "biological_child" || r.type === "adopted_child") {
            const p = parentMap.get(r.person_b) || [];
            p.push(r.person_a);
            parentMap.set(r.person_b, p);
        } else if (r.type === "marriage") {
            const sA = spouseMap.get(r.person_a) || []; sA.push(r.person_b); spouseMap.set(r.person_a, sA);
            const sB = spouseMap.get(r.person_b) || []; sB.push(r.person_a); spouseMap.set(r.person_b, sB);
        }
    }

    // 0. Direct marriage
    const spousesA = spouseMap.get(personA.id) || [];
    if (spousesA.includes(personB.id)) {
        return {
            aCallsB: personB.gender === "female" ? "Vợ" : "Chồng",
            bCallsA: personA.gender === "female" ? "Vợ" : "Chồng",
            description: "Quan hệ Hôn nhân",
            distance: 0,
            pathLabels: [`${personA.full_name} và ${personB.full_name} là vợ chồng.`],
        };
    }

    // 1. Blood kinship
    const blood = findBloodKinship(personA, personB, personsMap, parentMap);
    if (blood) return blood;

    // 2. Through A's spouse
    for (const sId of spousesA) {
        if (sId === personB.id) continue;
        const spouseA = personsMap.get(sId);
        if (!spouseA) continue;
        const res = findBloodKinship(spouseA, personB, personsMap, parentMap);
        if (res) {
            let aCallsB = res.aCallsB;
            let bCallsA = res.bCallsA;
            const suffix = personA.gender === "male" ? " vợ" : " chồng";
            if (["Bố", "Mẹ"].includes(aCallsB) || aCallsB.startsWith("Ông") || aCallsB.startsWith("Bà") || aCallsB.startsWith("Cụ")) {
                aCallsB = aCallsB + suffix;
            } else if (aCallsB.includes("Anh trai")) aCallsB = "Anh" + suffix;
            else if (aCallsB.includes("Chị gái")) aCallsB = "Chị" + suffix;
            else if (aCallsB === "Em họ") aCallsB = `Em (Em họ của ${suffix})`;
            else if (aCallsB.includes("Em")) aCallsB = "Em" + suffix;
            else if (["Bác", "Chú", "Cô", "Cậu", "Dì"].includes(aCallsB) || aCallsB.endsWith(" họ")) {
                aCallsB = aCallsB.replace(" họ", "") + suffix;
            }
            if (bCallsA === "Con") bCallsA = personA.gender === "male" ? "Con rể" : "Con dâu";
            else if (bCallsA === "Cháu") bCallsA = personA.gender === "male" ? "Cháu rể" : "Cháu dâu";
            else if (bCallsA.includes("Anh trai") || bCallsA.includes("Chị gái")) bCallsA = personA.gender === "male" ? "Anh rể" : "Chị dâu";
            else if (bCallsA.includes("Em")) bCallsA = personA.gender === "male" ? "Em rể" : "Em dâu";
            else if (bCallsA === "Chú") bCallsA = "Cô";
            else if (bCallsA === "Cô") bCallsA = "Chú";
            else if (bCallsA === "Cậu") bCallsA = "Dì";
            else if (bCallsA === "Dì") bCallsA = "Cậu";
            return { ...res, aCallsB, bCallsA, description: `Thông qua hôn nhân của ${spouseA.full_name}`, pathLabels: [`${personA.full_name} là vợ/chồng của ${spouseA.full_name}`, ...res.pathLabels] };
        }
    }

    // 3. Through B's spouse
    const spousesB = spouseMap.get(personB.id) || [];
    for (const sId of spousesB) {
        const spouseB = personsMap.get(sId);
        if (!spouseB) continue;
        const res = findBloodKinship(personA, spouseB, personsMap, parentMap);
        if (res) {
            let aCallsB = res.aCallsB;
            let bCallsA = res.bCallsA;
            if (aCallsB === "Con") aCallsB = personB.gender === "male" ? "Con rể" : "Con dâu";
            else if (aCallsB === "Cháu") aCallsB = personB.gender === "male" ? "Cháu rể" : "Cháu dâu";
            else if (aCallsB.includes("Anh trai")) aCallsB = personB.gender === "female" ? "Chị dâu" : "Anh rể";
            else if (aCallsB.includes("Chị gái")) aCallsB = personB.gender === "male" ? "Anh rể" : "Chị dâu";
            else if (aCallsB.includes("Em")) aCallsB = personB.gender === "male" ? "Em rể" : "Em dâu";
            else if (aCallsB === "Chú") aCallsB = "Cô";
            else if (aCallsB === "Cô") aCallsB = "Chú";
            else if (aCallsB === "Cậu") aCallsB = "Dì";
            else if (aCallsB === "Dì") aCallsB = "Cậu";
            const suffix = personB.gender === "male" ? " vợ" : " chồng";
            if (["Bố", "Mẹ"].includes(bCallsA) || bCallsA.startsWith("Ông") || bCallsA.startsWith("Bà") || bCallsA.startsWith("Cụ")) {
                bCallsA = bCallsA + suffix;
            } else if (bCallsA.includes("Anh trai")) bCallsA = "Anh" + suffix;
            else if (bCallsA.includes("Chị gái")) bCallsA = "Chị" + suffix;
            else if (bCallsA === "Em họ") bCallsA = `Em (Em họ của ${suffix})`;
            else if (bCallsA.includes("Em")) bCallsA = "Em" + suffix;
            else if (["Bác", "Chú", "Cô", "Cậu", "Dì"].includes(bCallsA) || bCallsA.endsWith(" họ")) {
                bCallsA = bCallsA.replace(" họ", "") + suffix;
            }
            return { ...res, aCallsB, bCallsA, description: `Thông qua hôn nhân của ${spouseB.full_name}`, pathLabels: [...res.pathLabels, `${personB.full_name} là vợ/chồng của ${spouseB.full_name}`] };
        }
    }

    // 4. Through both A's and B's spouses
    for (const sIdA of spousesA) {
        const spouseA = personsMap.get(sIdA);
        if (!spouseA) continue;
        for (const sIdB of spousesB) {
            if (sIdA === sIdB) continue;
            const spouseB = personsMap.get(sIdB);
            if (!spouseB) continue;
            const res = findBloodKinship(spouseA, spouseB, personsMap, parentMap);
            if (res) {
                const prefixA = personA.gender === "male" ? "Chồng" : "Vợ";
                const prefixB = personB.gender === "male" ? "Chồng" : "Vợ";
                let aCallsB = `${prefixA} của ${res.aCallsB}`;
                let bCallsA = `${prefixB} của ${res.bCallsA}`;
                if (res.description.includes("Anh chị em ruột")) {
                    if (personA.gender === "male" && personB.gender === "male" && spouseA.gender === "female" && spouseB.gender === "female") {
                        aCallsB = bCallsA = "Anh em cột chèo";
                    } else if (personA.gender === "female" && personB.gender === "female" && spouseA.gender === "male" && spouseB.gender === "male") {
                        aCallsB = bCallsA = "Chị em dâu";
                    }
                }
                return {
                    ...res, aCallsB, bCallsA,
                    description: `Thông qua hôn nhân của cả ${spouseA.full_name} và ${spouseB.full_name}`,
                    pathLabels: [`${personA.full_name} là ${prefixA} của ${spouseA.full_name}`, ...res.pathLabels, `${personB.full_name} là ${prefixB} của ${spouseB.full_name}`],
                };
            }
        }
    }

    return {
        aCallsB: "Chưa xác định",
        bCallsA: "Chưa xác định",
        description: "Không tìm thấy quan hệ trong phạm vi dữ liệu",
        distance: -1,
        pathLabels: [],
    };
}

module.exports = { computeKinship, normalizePerson, normalizeRelationship };
