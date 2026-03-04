/**
 * Tests: GET /api/persons/:id/tree
 *
 * Run:  npm test -- --testPathPattern=tree
 *
 * These tests spin up the Express app and connect to a real (or in-memory)
 * MongoDB. Set TEST_MONGO_URI in your .env or export it before running.
 *
 * Required packages (already installed):
 *   npm install --save-dev jest supertest
 */

"use strict";

const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/server"); // adjust if your entry point differs

// ── helpers ─────────────────────────────────────────────────────────────
const Person = require("../../src/models/PersonModel");
const Relationship = require("../../src/models/RelationshipModel");
const Branch = require("../../src/models/BranchModel");
const User = require("../../src/models/UserModel");
const jwt = require("jsonwebtoken");

let adminToken;
let branchId;
let personAId; // valid root
let personBId; // valid child

/**
 * Sign a fake admin JWT — must match the secret in .env
 */
const signToken = (userId) =>
    jwt.sign({ id: userId, role: "admin" }, process.env.JWT_SECRET || "test_secret", {
        expiresIn: "1h",
    });

// ── setup / teardown ─────────────────────────────────────────────────────
beforeAll(async () => {
    // Use a separate test DB (override via env)
    const uri = process.env.TEST_MONGO_URI || process.env.MONGO_URI;
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(uri);
    }

    // Create a minimal branch + two persons + one admin user
    const branch = await Branch.create({ name: "Test Branch", privacy: "public" });
    branchId = branch._id;

    const userDoc = await User.create({
        username: "testadmin_tree",
        email: "testadmin_tree@example.com",
        password: "hashed_irrelevant",
        role: "admin",
        branchId,
    });
    adminToken = signToken(userDoc._id.toString());

    personAId = (
        await Person.create({
            fullName: "Nguyễn Văn A",
            gender: "male",
            privacy: "public",
            branchId,
            isAlive: true,
        })
    )._id;

    personBId = (
        await Person.create({
            fullName: "Nguyễn Văn B",
            gender: "male",
            privacy: "public",
            branchId,
            isAlive: true,
        })
    )._id;

    // Valid parent→child relationship
    await Relationship.create({
        branchId,
        fromPersonId: personAId,
        toPersonId: personBId,
        type: "parent_of",
        status: "unknown",
        subType: "biological",
        createdBy: userDoc._id,
    });

    // ── Orphaned / dirty relationship with invalid string IDs ──
    // Insert directly (bypasses our new validation) to simulate legacy bad data
    await Relationship.collection.insertOne({
        branchId,
        fromPersonId: "abc_invalid_id",   // string, not ObjectId
        toPersonId: personBId,
        type: "parent_of",
        status: "unknown",
        subType: "biological",
        createdBy: userDoc._id,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
});

afterAll(async () => {
    // Clean up test data
    await Relationship.deleteMany({ branchId });
    await Person.deleteMany({ branchId });
    await Branch.deleteOne({ _id: branchId });
    await mongoose.connection.close();
});

// ── tests ─────────────────────────────────────────────────────────────────

describe("GET /api/persons/:id/tree", () => {
    // ─── Case 1: happy path ────────────────────────────────────────────────
    it("200 — returns nested tree for a valid person", async () => {
        const res = await request(app)
            .get(`/api/persons/${personAId}/tree?depth=3&includeSpouses=true&format=nested`)
            .set("Authorization", `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty("root");
        expect(res.body.data.root).toHaveProperty("fullName", "Nguyễn Văn A");
    });

    // ─── Case 2: invalid ObjectId in the URL ──────────────────────────────
    it("400 — returns INVALID_OBJECT_ID when :id is not a valid ObjectId", async () => {
        const res = await request(app)
            .get("/api/persons/not_a_valid_id/tree?format=nested")
            .set("Authorization", `Bearer ${adminToken}`);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error?.code).toBe("INVALID_OBJECT_ID");
    });

    // ─── Case 3: DB has relationship with invalid fromPersonId string ──────
    it("200 — silently skips orphaned / invalid relationship IDs (no 500)", async () => {
        // personBId's parent relationships include the injected dirty row.
        // The tree build must ignore it instead of throwing.
        const res = await request(app)
            .get(`/api/persons/${personBId}/tree?depth=5&includeSpouses=true&format=nested`)
            .set("Authorization", `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        // The dirty relationship should NOT surface as a real parent
        const root = res.body.data?.root;
        expect(root).toBeDefined();
        // parents should not contain an entry with id "abc_invalid_id"
        const parentIds = (root.parents || []).map((p) => p?._id?.toString());
        expect(parentIds).not.toContain("abc_invalid_id");
    });

    // ─── Case 4: 404 when person does not exist ────────────────────────────
    it("404 — returns PERSON_NOT_FOUND for a valid but non-existent ObjectId", async () => {
        const nonExistentId = new mongoose.Types.ObjectId().toString();
        const res = await request(app)
            .get(`/api/persons/${nonExistentId}/tree?format=nested`)
            .set("Authorization", `Bearer ${adminToken}`);

        expect(res.status).toBe(404);
        expect(res.body.error?.code).toBe("PERSON_NOT_FOUND");
    });
});
