async function filterPersonsByPrivacy(persons, securityGuard, user) {
    const checks = await Promise.all(
        persons.map(async (p) => {
            const hasAccess = await securityGuard.checkPrivacy(p, user);
            return hasAccess ? p : null;
        })
    );
    return checks.filter(Boolean);
}

module.exports = { filterPersonsByPrivacy };