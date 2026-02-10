const bcrypt = require("bcrypt");

async function buildModelData() {
    const passwordHash = await bcrypt.hash("123456", 10);

    const users = [
        { email: "admin@gp.local", passwordHash, fullName: "Admin", role: "admin" },
        { email: "editor@gp.local", passwordHash, fullName: "Editor", role: "editor" },
        { email: "member@gp.local", passwordHash, fullName: "Member", role: "member" },
    ];

    const branches = [
        { name: "Chi nhánh Họ Nguyễn", description: "Gia phả chi họ Nguyễn", ownerEmail: "admin@gp.local" },
        { name: "Chi nhánh Họ Trần", description: "Gia phả chi họ Trần", ownerEmail: "admin@gp.local" },
    ];

    const persons = [
        { branchName: "Chi nhánh Họ Nguyễn", fullName: "Nguyễn Văn A", gender: "male", privacy: "internal", note: "Tộc trưởng đời 1", generation: 1 },
        { branchName: "Chi nhánh Họ Nguyễn", fullName: "Nguyễn Thị B", gender: "female", privacy: "internal", note: "Vợ của Nguyễn Văn A", generation: 1 },
        { branchName: "Chi nhánh Họ Nguyễn", fullName: "Nguyễn Văn C", gender: "male", privacy: "internal", note: "Con trai", generation: 2 },
        { branchName: "Chi nhánh Họ Nguyễn", fullName: "Nguyễn Thị D", gender: "female", privacy: "public", note: "Con gái", generation: 2 },

        { branchName: "Chi nhánh Họ Trần", fullName: "Trần Văn K", gender: "male", privacy: "internal", note: "Đời 1", generation: 1 },
        { branchName: "Chi nhánh Họ Trần", fullName: "Trần Thị L", gender: "female", privacy: "internal", note: "Vợ", generation: 1 },
    ];

    const relationships = [
        { branchName: "Chi nhánh Họ Nguyễn", fromName: "Nguyễn Văn A", toName: "Nguyễn Thị B", type: "spouse_of" },

        { branchName: "Chi nhánh Họ Nguyễn", fromName: "Nguyễn Văn A", toName: "Nguyễn Văn C", type: "parent_of" },
        { branchName: "Chi nhánh Họ Nguyễn", fromName: "Nguyễn Văn A", toName: "Nguyễn Thị D", type: "parent_of" },

        { branchName: "Chi nhánh Họ Nguyễn", fromName: "Nguyễn Thị B", toName: "Nguyễn Văn C", type: "parent_of" },
        { branchName: "Chi nhánh Họ Nguyễn", fromName: "Nguyễn Thị B", toName: "Nguyễn Thị D", type: "parent_of" },

        { branchName: "Chi nhánh Họ Trần", fromName: "Trần Văn K", toName: "Trần Thị L", type: "spouse_of" },
    ];

    const events = [
        { branchName: "Chi nhánh Họ Nguyễn", title: "Hôn lễ A & B", type: "marriage", eventDate: new Date("2000-01-01"), location: "Hà Nội", privacy: "internal", personNames: ["Nguyễn Văn A", "Nguyễn Thị B"] },
        { branchName: "Chi nhánh Họ Nguyễn", title: "Sinh nhật Nguyễn Văn C", type: "birth", eventDate: new Date("2002-05-10"), location: "Hà Nội", privacy: "public", personNames: ["Nguyễn Văn C"] },
    ];

    const media = [
        { branchName: "Chi nhánh Họ Nguyễn", personName: "Nguyễn Văn A", kind: "image", originalName: "avatar-a.jpg", mimeType: "image/jpeg", sizeBytes: 123456, storagePath: "storage/uploads/avatar-a.jpg", privacy: "public" },
        { branchName: "Chi nhánh Họ Nguyễn", eventTitle: "Hôn lễ A & B", kind: "video", originalName: "wedding.mp4", mimeType: "video/mp4", sizeBytes: 987654321, storagePath: "storage/uploads/wedding.mp4", hlsPath: "storage/transcoded/wedding/index.m3u8", privacy: "internal" },
    ];

    return { users, branches, persons, relationships, events, media };
}

module.exports = { buildModelData };