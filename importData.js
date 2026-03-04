require("dotenv").config();
const mongoose = require("mongoose");
const xlsx = require("xlsx"); // DÙNG THƯ VIỆN ĐỌC EXCEL
const path = require("path");

const Person = require("./src/models/PersonModel");
const Relationship = require("./src/models/RelationshipModel");

// ─── CẤU HÌNH ───
const MONGO_URI = process.env.MONGO_URI;
// Trỏ thẳng vào file Excel gốc của bạn
const EXCEL_FILE_PATH = path.join(__dirname, "data.xlsx");

const BRANCH_ID = "69a16326f6448f9a7d0afb2f";
const USER_ID = "69a16325f6448f9a7d0afb1f";

// Chuẩn hóa chuỗi tên
const norm = (s) => String(s || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

function parseGender(raw) {
    const s = norm(raw);
    if (s.includes("nữ") || s === "f" || s === "female") return "female";
    if (s.includes("nam") || s === "m" || s === "male") return "male";
    return "unknown";
}

// Lọc các từ thừa như "Bà 1", "Vợ cụ..."
function cleanNames(rawStr) {
    if (!rawStr) return [];
    return String(rawStr).split(/[,;]/).map(s => {
        let n = s.trim();
        n = n.replace(/^(bà|ông|cụ|vợ|chồng)\s*([1-9]|cả|hai|ba|tư|năm)?\s*:?/i, "").trim();
        return norm(n);
    }).filter(n => n.length > 0);
}

async function runImport() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ Kết nối MongoDB thành công!");

        console.log("📂 Đang đọc file data.xlsx...");
        const workbook = xlsx.readFile(EXCEL_FILE_PATH);
        const sheetName = workbook.SheetNames[0];
        // raw: false để Excel giữ nguyên định dạng ngày tháng hiển thị
        const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: false });

        console.log(`📊 Đã đọc ${rows.length} dòng từ Excel. Bắt đầu tạo dữ liệu...`);

        const createdPersons = [];

        // ── PASS 1: TẠO THÀNH VIÊN VÀ LƯU ĐỜI THỨ ──
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const fullNameRaw = String(row["Họ và tên"] || "").trim();
            if (!fullNameRaw) continue;

            const ngaySinh = String(row["Ngày sinh(Dương lịch)"] || "").trim();
            let dateOfBirth = null;
            if (ngaySinh) {
                const yearMatch = ngaySinh.match(/\b(1[3-9]\d{2}|2\d{3})\b/);
                if (yearMatch) dateOfBirth = new Date(`${yearMatch[1]}-01-01`);
            }

            const genRaw = String(row["Đời thứ"] || "").trim();
            const generation = genRaw ? parseInt(genRaw, 10) : null;

            const occupationRaw = String(row["Nghề nghiệp"] || "").trim();
            const isAlive = !/(đã\s*mất|da\s*mat)/i.test(occupationRaw);

            const person = await Person.create({
                branchId: BRANCH_ID,
                fullName: fullNameRaw,
                gender: parseGender(row["Giới tính"]),
                dateOfBirth,
                lunarDateOfDeath: String(row["Ngày mất(Âm lịch)"] || "").trim(),
                isAlive,
                generation,
                subBranch: String(row["Chi - Ngành"] || "").trim(),
                occupation: isAlive ? occupationRaw : occupationRaw.replace(/(đã\s*mất|da\s*mat)[,;\s]*/gi, "").trim(),
                hometown: String(row["Quê quán"] || "").trim(),
                currentAddress: String(row["Nơi ở hiện tại (Mộ phần)"] || "").trim(),
                note: String(row["Ghi chú khác ( Ảnh, học vị, chức vụ …)"] || "").trim(),
                createdBy: USER_ID,
                privacy: "public"
            });

            // Ghi nhớ thông tin quan trọng để ghép cặp
            createdPersons.push({ row, personId: person._id, fullName: norm(fullNameRaw), generation });
        }

        console.log(`👤 Đã tạo ${createdPersons.length} người. Đang thiết lập quan hệ bằng "Khóa Đời Thứ"...`);

        async function safeCreateRel(fromId, toId, type) {
            if (!fromId || !toId || fromId.toString() === toId.toString()) return;
            const exists = await Relationship.findOne({ branchId: BRANCH_ID, fromPersonId: fromId, toPersonId: toId, type });
            if (!exists) await Relationship.create({ branchId: BRANCH_ID, fromPersonId: fromId, toPersonId: toId, type, createdBy: USER_ID });
        }

        // 🎯 THUẬT TOÁN TÌM NGƯỜI DỰA TRÊN KHOẢNG CÁCH DÒNG & ĐỜI THỨ
        function findPersonId(namesArray, currentIndex, targetGeneration) {
            const foundIds = [];
            for (const name of namesArray) {
                let foundId = null;
                // Ưu tiên 1: Quét ngược lên trên (Vì cha/chồng luôn ghi ở dòng trên)
                for (let j = currentIndex - 1; j >= 0; j--) {
                    const p = createdPersons[j];
                    if (p.fullName === name) {
                        // Khóa Đời khớp => Chốt luôn!
                        if (targetGeneration !== null && p.generation === targetGeneration) {
                            foundId = p.personId; break;
                        }
                        // Lưu dự phòng nếu hàng đó quên nhập Đời thứ
                        if (!foundId && p.generation === null) foundId = p.personId;
                    }
                }

                // Ưu tiên 2: Quét xuống dưới (Phòng trường hợp ghi lộn xộn)
                if (!foundId) {
                    for (let j = currentIndex + 1; j < createdPersons.length; j++) {
                        const p = createdPersons[j];
                        if (p.fullName === name) {
                            if (targetGeneration !== null && p.generation === targetGeneration) {
                                foundId = p.personId; break;
                            }
                            if (!foundId && p.generation === null) foundId = p.personId;
                        }
                    }
                }
                if (foundId) foundIds.push(foundId);
            }
            return foundIds;
        }

        // ── PASS 2: NỐI QUAN HỆ CÓ KHÓA ĐỜI ──
        for (let i = 0; i < createdPersons.length; i++) {
            const { row, personId, generation } = createdPersons[i];

            // 1. NỐI CHA/MẸ (Đời Cha/Mẹ = Đời Con - 1)
            const parentGen = (generation !== null && !isNaN(generation)) ? generation - 1 : null;

            const fIds = findPersonId(cleanNames(row["Tên Cha"]), i, parentGen);
            for (let fId of fIds) await safeCreateRel(fId, personId, "parent_of");

            const mIds = findPersonId(cleanNames(row["Tên Mẹ"]), i, parentGen);
            for (let mId of mIds) await safeCreateRel(mId, personId, "parent_of");

            // 2. NỐI VỢ/CHỒNG (Đời Vợ = Đời Chồng)
            const spouseGen = (generation !== null && !isNaN(generation)) ? generation : null;
            const sIds = findPersonId(cleanNames(row["Vợ/Chồng"]), i, spouseGen);
            for (let sId of sIds) {
                await safeCreateRel(personId, sId, "spouse_of");
                await safeCreateRel(sId, personId, "spouse_of"); // Nối 2 chiều
            }

            // 3. NỐI CÁC CON (Đời Con = Đời Cha/Mẹ + 1)
            const childGen = (generation !== null && !isNaN(generation)) ? generation + 1 : null;
            const childCols = Object.keys(row).filter(k => /^con\s*s[oố]\s*\d+$/i.test(String(k).trim()));
            for (const col of childCols) {
                const cIds = findPersonId(cleanNames(row[col]), i, childGen);
                for (let cId of cIds) await safeCreateRel(personId, cId, "parent_of");
            }
        }

        console.log("🎉 IMPORT THÀNH CÔNG TỪ FILE EXCEL data.xlsx!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Lỗi import:", error);
        process.exit(1);
    }
}

runImport();