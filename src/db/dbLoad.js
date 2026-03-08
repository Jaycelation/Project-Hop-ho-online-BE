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

function mustGet(map, key, label) {
    const v = map.get(key);
    if (!v) throw new Error(`Missing ${label}: ${key}`);
    return v;
}

(async () => {
    try {
        await connectDB();
        const { users, branches, persons, relationships, events, media } = await buildModelData();

        console.log("Recovery Mode: Đang khôi phục kết nối dữ liệu...");

        // 1) KHÔI PHỤC USER: Tìm theo EMAIL, gán username cho user cũ và xóa clone
        const insertedUsers = [];
        for (const u of users) {
            // Tìm tất cả user có cùng email, sắp xếp cũ nhất lên đầu
            const existing = await User.find({ email: u.email }).sort({ createdAt: 1 });
            
            let user;
            if (existing.length > 0) {
                user = existing[0]; // Lấy nick cũ nhất (nick đang sở hữu toàn bộ gia phả cũ)
                user.username = u.username; // Cập nhật username mới
                await user.save();
                
                // Xóa các nick clone do script lần trước lỡ tạo ra
                if (existing.length > 1) {
                    for (let i = 1; i < existing.length; i++) {
                        await User.findByIdAndDelete(existing[i]._id);
                    }
                }
            } else {
                user = await User.create(u);
            }
            insertedUsers.push(user);
        }
        const userByEmail = new Map(insertedUsers.map((u) => [u.email, u]));

        // 2) KHÔI PHỤC BRANCH: Thêm branchCode cho các branch cũ nếu đang thiếu
        const insertedBranches = [];
        for (let i = 0; i < branches.length; i++) {
            const b = branches[i];
            let branch = await Branch.findOne({ name: b.name });

            if (branch) {
                // Nếu branch cũ chưa có branchCode, update luôn cho nó
                if (!branch.branchCode) {
                    branch.branchCode = `BR_${Date.now()}_${i}`;
                    await branch.save();
                }
            } else {
                // Tạo mới nếu chưa có
                const owner = mustGet(userByEmail, b.ownerEmail, "owner user by email");
                branch = await Branch.create({
                    name: b.name,
                    branchCode: `BR_${Date.now()}_${i}`,
                    description: b.description,
                    ownerId: owner._id,
                    members: [
                        { userId: owner._id, roleInBranch: "owner" },
                        { userId: mustGet(userByEmail, "editor@gp.local", "editor")._id, roleInBranch: "editor" },
                        { userId: mustGet(userByEmail, "member@gp.local", "member")._id, roleInBranch: "viewer" },
                    ],
                });
            }
            insertedBranches.push(branch);
        }
        const branchByName = new Map(insertedBranches.map((b) => [b.name, b]));

        // 3) PERSONS (Chỉ nạp thêm nếu thiếu)
        const insertedPersons = [];
        const admin = mustGet(userByEmail, "admin@gp.local", "admin");
        for (const p of persons) {
            const br = mustGet(branchByName, p.branchName, "branch by name");
            let person = await Person.findOne({ fullName: p.fullName, branchId: br._id });
            if (!person) {
                person = await Person.create({
                    branchId: br._id,
                    fullName: p.fullName,
                    gender: p.gender,
                    privacy: p.privacy,
                    note: p.note,
                    generation: p.generation ?? null,
                    createdBy: admin._id,
                });
            }
            insertedPersons.push(person);
        }

        const personKey = (branchName, fullName) => `${branchName}::${fullName}`;
        const personByKey = new Map();
        insertedPersons.forEach((p) => {
            const br = insertedBranches.find((b) => String(b._id) === String(p.branchId));
            const brName = br ? br.name : "UNKNOWN";
            personByKey.set(personKey(brName, p.fullName), p);
        });

        // 4) RELATIONSHIPS
        for (const r of relationships) {
            const br = mustGet(branchByName, r.branchName, "branch by name");
            const from = mustGet(personByKey, personKey(r.branchName, r.fromName), "from person");
            const to = mustGet(personByKey, personKey(r.branchName, r.toName), "to person");
            
            const relExists = await Relationship.findOne({ branchId: br._id, fromPersonId: from._id, toPersonId: to._id, type: r.type });
            if (!relExists) {
                await Relationship.create({
                    branchId: br._id,
                    fromPersonId: from._id,
                    toPersonId: to._id,
                    type: r.type,
                    createdBy: admin._id,
                });
            }
        }

        console.log("✅ KHÔI PHỤC HOÀN TẤT!");
        console.log("👉 Dữ liệu cũ đã được kết nối lại với tài khoản.");
        console.log("👉 Hãy đăng nhập lại với username: 'admin' và password: '123456'");
        
        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error("dbLoad failed:", err);
        try { await mongoose.disconnect(); } catch (_) {}
        process.exit(1);
    }
})();