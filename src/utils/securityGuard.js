const Branch = require("../models/BranchModel");
const { hasBranchRole } = require("./branchAccess");

exports.checkPrivacy = async (resource, user) => {
    if (!resource) return false;
    if (resource.privacy === "public") return true;
    if (!user) return false;
    if (user.role === "admin") return true;

    if (!resource.branchId) return false;

    const branch = await Branch.findById(resource.branchId);
    if (!branch) return false;

    if (resource.privacy === "internal") {
        return hasBranchRole(branch, user, "viewer");
    }

    if (resource.privacy === "sensitive") {
        return hasBranchRole(branch, user, "editor");
    }

    return false;
};
