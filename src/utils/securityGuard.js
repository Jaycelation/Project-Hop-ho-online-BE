const Branch = require("../models/BranchModel");

exports.checkPrivacy = async (resource, user) => {
    if (resource.privacy === "public") return true;

    if (!user) return false;

    if (user.role === "admin") return true;

    if (resource.privacy === "internal") {
        return true; 
    }
    if (resource.privacy === "sensitive") {
        if (user.role === "editor") return true;

        if (resource.branchId) {
            const branch = await Branch.findById(resource.branchId);
            if (branch) {
                const uid = user._id.toString();
                const isOwner = branch.ownerId && branch.ownerId.toString() === uid;
                const isMember = branch.members.some(m => m.userId.toString() === uid);
                if (isOwner || isMember) return true;
            }
        }
    }

    return false;
};