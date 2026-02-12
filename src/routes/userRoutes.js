const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { verifyToken, authorizeRoles } = require("../middlewares/authMiddleware");

// Current User Routes
router.get("/me", verifyToken, userController.getMe);
router.put("/me", verifyToken, userController.updateMe);

// Admin Routes
router.get("/", verifyToken, authorizeRoles("admin"), userController.listUsers);
router.put("/:id/role", verifyToken, authorizeRoles("admin"), userController.updateUserRole);
router.put("/:id/ban", verifyToken, authorizeRoles("admin"), userController.banUser);

module.exports = router;
