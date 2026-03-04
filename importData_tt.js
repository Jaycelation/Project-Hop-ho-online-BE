require('dotenv').config();
const mongoose = require('mongoose');
const xlsx = require('xlsx');
const path = require('path');

const Person = require('./src/models/PersonModel');
const Relationship = require('./src/models/RelationshipModel');

// ─── CẤU HÌNH ───
const MONGO_URI = process.env.MONGO_URI;
// ✅ File excel đã được bổ sung cột TT_Cha/TT_Me/TT_VoChong/TT_Con...
const EXCEL_FILE_PATH = path.join(__dirname, 'data_with_tt_relations.xlsx');

// ⚠️ sửa 2 giá trị này theo branch/user của bạn
const BRANCH_ID = '69a16326f6448f9a7d0afb2f';
const USER_ID = '69a16325f6448f9a7d0afb1f';

// Nếu muốn xóa sạch dữ liệu cũ của branch trước khi import lại
const WIPE_BRANCH_BEFORE_IMPORT = false;

const norm = (s) => String(s || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

function parseGender(raw) {
  const s = norm(raw).toLowerCase();
  if (s.includes('nữ') || s === 'f' || s === 'female') return 'female';
  if (s.includes('nam') || s === 'm' || s === 'male') return 'male';
  return 'unknown';
}

function parseTT(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s) return null;
  // Excel đôi khi đọc số dạng 12.0
  const n = Number(s);
  if (Number.isFinite(n)) return Math.trunc(n);
  // fallback: lấy số đầu tiên trong chuỗi
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

async function safeCreateRel(branchId, fromId, toId, type) {
  if (!fromId || !toId) return;
  if (fromId.toString() === toId.toString()) return;
  const exists = await Relationship.findOne({ branchId, fromPersonId: fromId, toPersonId: toId, type }).lean();
  if (!exists) {
    await Relationship.create({
      branchId,
      fromPersonId: fromId,
      toPersonId: toId,
      type,
      createdBy: USER_ID,
    });
  }
}

async function runImport() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Kết nối MongoDB thành công!');

    if (WIPE_BRANCH_BEFORE_IMPORT) {
      console.log('🧹 Đang xoá dữ liệu cũ theo branchId...');
      await Relationship.deleteMany({ branchId: BRANCH_ID });
      await Person.deleteMany({ branchId: BRANCH_ID });
      console.log('✅ Đã xoá xong Persons + Relationships của branch.');
    }

    console.log('📂 Đang đọc file Excel:', EXCEL_FILE_PATH);
    const workbook = xlsx.readFile(EXCEL_FILE_PATH);
    const sheetName = workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false });

    console.log(`📊 Đã đọc ${rows.length} dòng từ Excel. Bắt đầu import...`);

    // Pass 1: tạo Persons và map TT -> _id
    const ttToPersonId = new Map();
    const ttToRowIndex = new Map();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const tt = parseTT(row['TT']);
      const fullNameRaw = norm(row['Họ và tên']);
      if (!tt || !fullNameRaw) continue;

      const ngaySinh = norm(row['Ngày sinh(Dương lịch)']);
      let dateOfBirth = null;
      if (ngaySinh) {
        const yearMatch = ngaySinh.match(/\b(1[3-9]\d{2}|2\d{3})\b/);
        if (yearMatch) dateOfBirth = new Date(`${yearMatch[1]}-01-01`);
      }

      const genRaw = norm(row['Đời thứ']);
      const generation = genRaw ? parseInt(genRaw, 10) : null;

      const occupationRaw = norm(row['Nghề nghiệp']);
      const isAlive = !/(đã\s*mất|da\s*mat)/i.test(occupationRaw);

      const person = await Person.create({
        branchId: BRANCH_ID,
        fullName: fullNameRaw,
        gender: parseGender(row['Giới tính']),
        dateOfBirth,
        lunarDateOfDeath: norm(row['Ngày mất(Âm lịch)']),
        isAlive,
        generation,
        subBranch: norm(row['Chi - Ngành']),
        occupation: isAlive ? occupationRaw : occupationRaw.replace(/(đã\s*mất|da\s*mat)[,;\s]*/gi, '').trim(),
        hometown: norm(row['Quê quán']),
        currentAddress: norm(row['Nơi ở hiện tại (Mộ phần)']),
        note: norm(row['Ghi chú khác ( Ảnh, học vị, chức vụ …)']),
        createdBy: USER_ID,
        privacy: 'public',
      });

      ttToPersonId.set(tt, person._id);
      ttToRowIndex.set(tt, i);
    }

    console.log(`👤 Đã tạo ${ttToPersonId.size} người. Bắt đầu nối quan hệ bằng cột TT_*...`);

    // Pass 2: tạo Relationships dựa trên TT_*
    const childTTCols = Object.keys(rows[0] || {}).filter((k) => /^TT_Con_so_\d+$/i.test(String(k).trim()));

    let relCount = 0;
    const missingRefs = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const tt = parseTT(row['TT']);
      if (!tt) continue;
      const meId = ttToPersonId.get(tt);
      if (!meId) continue;

      // Cha/Mẹ
      const ttCha = parseTT(row['TT_Cha']);
      const ttMe = parseTT(row['TT_Me']);
      if (ttCha) {
        const fatherId = ttToPersonId.get(ttCha);
        if (fatherId) {
          await safeCreateRel(BRANCH_ID, fatherId, meId, 'parent_of');
          relCount++;
        } else {
          missingRefs.push({ tt, field: 'TT_Cha', refTT: ttCha });
        }
      }
      if (ttMe) {
        const motherId = ttToPersonId.get(ttMe);
        if (motherId) {
          await safeCreateRel(BRANCH_ID, motherId, meId, 'parent_of');
          relCount++;
        } else {
          missingRefs.push({ tt, field: 'TT_Me', refTT: ttMe });
        }
      }

      // Vợ/Chồng (2 chiều)
      const ttVoChong = parseTT(row['TT_VoChong']);
      if (ttVoChong) {
        const spouseId = ttToPersonId.get(ttVoChong);
        if (spouseId) {
          await safeCreateRel(BRANCH_ID, meId, spouseId, 'spouse_of');
          await safeCreateRel(BRANCH_ID, spouseId, meId, 'spouse_of');
          relCount += 2;
        } else {
          missingRefs.push({ tt, field: 'TT_VoChong', refTT: ttVoChong });
        }
      }

      // Con
      for (const col of childTTCols) {
        const childTT = parseTT(row[col]);
        if (!childTT) continue;
        const childId = ttToPersonId.get(childTT);
        if (childId) {
          await safeCreateRel(BRANCH_ID, meId, childId, 'parent_of');
          relCount++;
        } else {
          missingRefs.push({ tt, field: col, refTT: childTT });
        }
      }
    }

    console.log(`🔗 Đã tạo/đảm bảo ~${relCount} quan hệ (trừ quan hệ đã tồn tại).`);

    if (missingRefs.length) {
      console.log('⚠️ Có tham chiếu TT_* không tìm thấy Person tương ứng (thường do TT trống hoặc dòng chưa được tạo):');
      console.log(missingRefs.slice(0, 30));
      console.log(`... tổng ${missingRefs.length} lỗi tham chiếu. Bạn có thể kiểm tra lại các cột TT_*.`);
    }

    console.log('🎉 IMPORT THÀNH CÔNG TỪ FILE data_with_tt_relations.xlsx!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi import:', error);
    process.exit(1);
  }
}

runImport();
