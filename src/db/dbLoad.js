require("dotenv").config();
const mongoose = require("mongoose");

const User = require("../models/UserModel");
const Branch = require("../models/BranchModel");
const Person = require("../models/PersonModel");
const Relationship = require("../models/RelationshipModel");
const Event = require("../models/EventModel");
const Media = require("../models/MediaModel");
const AuditLog = require("../models/AuditLogModel");
const RefreshToken = require("../models/RefreshTokenModel");

const { buildModelData } = require("../models/modelData/modelData");

async function connectDB() {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error("Missing MONGO_URI in .env");
    mongoose.set("strictQuery", true);
    await mongoose.connect(uri);
    console.log("MongoDB connected (dbLoad)");
}

async function clearCollections() {
    await Promise.all([
        User.deleteMany({}),
        Branch.deleteMany({}),
        Person.deleteMany({}),
        Relationship.deleteMany({}),
        Event.deleteMany({}),
        Media.deleteMany({}),
        AuditLog.deleteMany({}),
        RefreshToken.deleteMany({}),
    ]);
    console.log("Cleared collections");
}

function mustGet(map, key, label) {
    const v = map.get(key);
    if (!v) throw new Error(`Missing ${label}: ${key}`);
    return v;
}

(async () => {
    try {
        await connectDB();

        const { users, branches, persons, relationships, events, media } = await buildModelData();

        // 1) reset DB
        await clearCollections();

        // 2) insert Users
        const insertedUsers = await User.insertMany(users);
        const userByEmail = new Map(insertedUsers.map((u) => [u.email, u]));

        // 3) insert Branches (resolve ownerEmail -> ownerId) + add members
        const branchDocs = branches.map((b) => {
            const owner = mustGet(userByEmail, b.ownerEmail, "owner user by email");
            return {
                name: b.name,
                description: b.description,
                ownerId: owner._id,
                members: [
                    { userId: owner._id, roleInBranch: "owner" },
                    { userId: mustGet(userByEmail, "editor@gp.local", "editor")._id, roleInBranch: "editor" },
                    { userId: mustGet(userByEmail, "member@gp.local", "member")._id, roleInBranch: "viewer" },
                ],
            };
        });

        const insertedBranches = await Branch.insertMany(branchDocs);
        const branchByName = new Map(insertedBranches.map((b) => [b.name, b]));

        // 4) insert Persons (resolve branchName -> branchId, createdBy -> admin)
        const admin = mustGet(userByEmail, "admin@gp.local", "admin");
        const personDocs = persons.map((p) => {
            const br = mustGet(branchByName, p.branchName, "branch by name");
            return {
                branchId: br._id,
                fullName: p.fullName,
                gender: p.gender,
                privacy: p.privacy,
                note: p.note,
                generation: p.generation ?? null,
                createdBy: admin._id,
            };
        });

        const insertedPersons = await Person.insertMany(personDocs);

        const personKey = (branchName, fullName) => `${branchName}::${fullName}`;
        const personByKey = new Map();
        insertedPersons.forEach((p) => {
            const br = insertedBranches.find((b) => String(b._id) === String(p.branchId));
            const brName = br ? br.name : "UNKNOWN";
            personByKey.set(personKey(brName, p.fullName), p);
        });

        // 5) insert Relationships (resolve names -> ids)
        const relationshipDocs = relationships.map((r) => {
            const br = mustGet(branchByName, r.branchName, "branch by name");
            const from = mustGet(personByKey, personKey(r.branchName, r.fromName), "from person");
            const to = mustGet(personByKey, personKey(r.branchName, r.toName), "to person");
            return {
                branchId: br._id,
                fromPersonId: from._id,
                toPersonId: to._id,
                type: r.type,
                createdBy: admin._id,
            };
        });

        await Relationship.insertMany(relationshipDocs);

        // 6) insert Events (resolve personNames -> personIds)
        const eventDocs = events.map((e) => {
            const br = mustGet(branchByName, e.branchName, "branch by name");
            const personIds = (e.personNames || []).map((n) => mustGet(personByKey, personKey(e.branchName, n), "event person")._id);
            return {
                branchId: br._id,
                title: e.title,
                type: e.type,
                eventDate: e.eventDate ?? null,
                location: e.location ?? "",
                description: e.description ?? "",
                privacy: e.privacy ?? "internal",
                personIds,
                createdBy: admin._id,
            };
        });

        const insertedEvents = await Event.insertMany(eventDocs);
        const eventByTitleKey = new Map(insertedEvents.map((ev) => [`${ev.branchId}::${ev.title}`, ev]));

        // 7) insert Media (resolve personName/eventTitle -> ids)
        const mediaDocs = media.map((m) => {
            const br = mustGet(branchByName, m.branchName, "branch by name");

            let personId = null;
            if (m.personName) {
                personId = mustGet(personByKey, personKey(m.branchName, m.personName), "media person")._id;
            }

            let eventId = null;
            if (m.eventTitle) {
                const ev = eventByTitleKey.get(`${br._id}::${m.eventTitle}`);
                if (!ev) throw new Error(`Missing event for media: ${m.eventTitle}`);
                eventId = ev._id;
            }

            return {
                branchId: br._id,
                personId,
                eventId,
                kind: m.kind,
                originalName: m.originalName,
                mimeType: m.mimeType,
                sizeBytes: m.sizeBytes,
                storagePath: m.storagePath,
                hlsPath: m.hlsPath ?? "",
                privacy: m.privacy ?? "internal",
                uploadedBy: admin._id,
            };
        });

        const insertedMedia = await Media.insertMany(mediaDocs);

        const nguyenBranch = branchByName.get("Chi nhánh Họ Nguyễn");
        const a = personByKey.get(personKey("Chi nhánh Họ Nguyễn", "Nguyễn Văn A"));
        const avatar = insertedMedia.find((x) => String(x.personId) === String(a._id) && x.kind === "image");
        if (nguyenBranch && a && avatar) {
            await Person.updateOne({ _id: a._id }, { $set: { avatarMediaId: avatar._id } });
        }

        console.log("Seed done!");
        console.log(`Users: ${insertedUsers.length}`);
        console.log(`Branches: ${insertedBranches.length}`);
        console.log(`Persons: ${insertedPersons.length}`);
        console.log(`Events: ${insertedEvents.length}`);
        console.log(`Media: ${insertedMedia.length}`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error("dbLoad failed:", err);
        try { await mongoose.disconnect(); } catch (_) { }
        process.exit(1);
    }
})();
