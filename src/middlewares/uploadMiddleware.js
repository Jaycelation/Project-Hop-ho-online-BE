const multer = require("multer");
const path = require("path");
const fs = require("fs");

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, "../../storage/uploads");
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    },
});

const createUpload = ({ allowedTypes, errorMessage, fileSize = 50 * 1024 * 1024 }) => {
    const fileFilter = (req, file, cb) => {
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(errorMessage), false);
        }
    };

    return multer({
        storage,
        limits: { fileSize },
        fileFilter,
    });
};

const mediaUpload = createUpload({
    allowedTypes: ["image/jpeg", "image/png", "image/gif", "video/mp4", "video/webm"],
    errorMessage: "Invalid file type. Only images and videos are allowed.",
});

const csvUpload = createUpload({
    allowedTypes: ["text/csv", "application/csv", "application/vnd.ms-excel"],
    errorMessage: "Invalid file type. Only CSV files are allowed.",
    fileSize: 10 * 1024 * 1024,
});

module.exports = mediaUpload;
module.exports.mediaUpload = mediaUpload;
module.exports.csvUpload = csvUpload;
module.exports.createUpload = createUpload;
