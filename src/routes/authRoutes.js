const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const validate = require("../middlewares/validate");
const { registerSchema, loginSchema } = require("../validators/authValidator");
const { verifyToken } = require("../middlewares/authMiddleware");
router.post("/register", validate(registerSchema), authController.register);
router.post("/login", validate(loginSchema), authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.post("/change-password-mandatory", verifyToken, authController.changePasswordMandatory);

module.exports = router;
