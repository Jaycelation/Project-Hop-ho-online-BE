const Branch = require("../models/BranchModel");

/**
 * Privacy levels:
 *   "public"    — visible to everyone (even unauthenticated)
 *   "internal"  — visible ONLY to members of the resource's branch
 *   "sensitive" — visible ONLY to branch owner or global editor/admin
 */
exports.checkPrivacy = async (resource, user) => {
    // Public: always accessible
    if (resource.privacy === "public") return true;

    // Non-public resources require authentication
    if (!user) return false;

    // Global admin bypasses all privacy checks
    if (user.role === "admin") return true;

    // ── internal: only members of the owning branch ──────────────────────────
    if (resource.privacy === "internal") {
        if (!resource.branchId) return false;

        const branch = await Branch.findById(resource.branchId).lean();
        if (!branch) return false;

        const uid = user._id.toString();
        const isOwner = branch.ownerId && branch.ownerId.toString() === uid;
        const membersList = Array.isArray(branch.members) ? branch.members : [];
        const isMember = membersList.some(m => m && m.userId && m.userId.toString() === uid);
        return isOwner || isMember;
    }

    // ── sensitive: only global editor/admin OR branch owner ──────────────────
    if (resource.privacy === "sensitive") {
        // Global editor can see sensitive resources
        if (user.role === "editor") return true;

        if (resource.branchId) {
            const branch = await Branch.findById(resource.branchId).lean();
            if (branch) {
                const uid = user._id.toString();
                // Only owner-level branch members see sensitive data
                const isOwner = branch.ownerId && branch.ownerId.toString() === uid;
                const isEditorInBranch = branch.members.some(
                    m => m.userId.toString() === uid && m.roleInBranch === "editor"
                );
                if (isOwner || isEditorInBranch) return true;
            }
        }
    }

    return false;
};