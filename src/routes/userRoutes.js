const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { verifyToken, authorizeRoles } = require("../middlewares/authMiddleware");
const validate = require("../middlewares/validate");
const { updateMeSchema, updateUserRoleSchema, banUserSchema, changePasswordSchema } = require("../validators/userValidator");

router.get("/me", verifyToken, userController.getMe);
router.put("/me", verifyToken, validate(updateMeSchema), userController.updateMe);
router.put("/me/password", verifyToken, validate(changePasswordSchema), userController.changePassword);
router.get("/", verifyToken, authorizeRoles("admin"), userController.listUsers);
router.put("/:id/role", verifyToken, authorizeRoles("admin"), validate(updateUserRoleSchema), userController.updateUserRole);
router.put("/:id/ban", verifyToken, authorizeRoles("admin"), validate(banUserSchema), userController.banUser);
router.post(
    "/create-from-person", 
    verifyToken, 
    authorizeRoles("admin", "editor"), 
    userController.createUserFromPerson
);
module.exports = router;
