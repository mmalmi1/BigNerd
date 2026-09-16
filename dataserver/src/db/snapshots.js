const db = require("../dbConn.js").db;

// The 48 skill Lvl/Exp columns shared by snapshotdata, in the same order
// as the old startdata/enddata tables (overall first, then the 23
// remaining skills). Kept as one list so the column order isn't retyped
// by hand at every call site that builds a snapshotdata row.
const SKILL_COLUMNS = [
    "overallLvl", "overallExp",
    "attackLvl", "attackExp",
    "defenceLvl", "defenceExp",
    "strengthLvl", "strengthExp",
    "hitpointsLvl", "hitpointsExp",
    "rangedLvl", "rangedExp",
    "prayerLvl", "prayerExp",
    "magicLvl", "magicExp",
    "cookingLvl", "cookingExp",
    "woodcuttingLvl", "woodcuttingExp",
    "fletchingLvl", "fletchingExp",
    "fishingLvl", "fishingExp",
    "firemakingLvl", "firemakingExp",
    "craftingLvl", "craftingExp",
    "smithingLvl", "smithingExp",
    "miningLvl", "miningExp",
    "herbloreLvl", "herbloreExp",
    "agilityLvl", "agilityExp",
    "thievingLvl", "thievingExp",
    "slayerLvl", "slayerExp",
    "farmingLvl", "farmingExp",
    "runecraftingLvl", "runecraftingExp",
    "hunterLvl", "hunterExp",
    "constructionLvl", "constructionExp",
];
exports.SKILL_COLUMNS = SKILL_COLUMNS;

// The skill keys (SKILL_COLUMNS with the trailing "Lvl"/"Exp" stripped),
// e.g. "overall", "attack", ... -- the vocabulary a caller picks a skill
// from, derived from SKILL_COLUMNS so the two never drift apart.
const SKILL_KEYS = SKILL_COLUMNS.filter(c => c.endsWith("Lvl")).map(c => c.slice(0, -3));
exports.SKILL_KEYS = SKILL_KEYS;

// Inserts one append-only snapshot row for `username`. `infoArr` is the
// existing [[lvl, exp], [lvl, exp], ...] shape already built by the
// hiscore-fetch code in dataserver.js (24 entries: overall + 23 skills),
// in the same order as SKILL_COLUMNS.
//
// Every capture (the /users/add fetch, the 30-min cron, and the
// start-of-month cron) now does one plain INSERT here instead of
// updating a row in place — see vault artifact LLM-BIG-1: the resulting
// unbounded row growth (~48 new rows/user/day from the 30-min cron, no
// pruning) is an accepted, decided tradeoff for this ticket, not an
// oversight.
function recordSnapshot(username, infoArr, capturedAt = new Date().toISOString()) {
    return new Promise((resolve, reject) => {
        var columns = ["username", "capturedAt", ...SKILL_COLUMNS];
        var placeholders = columns.map(() => "?").join(",");
        var values = [username, capturedAt];
        for (let i = 0; i < SKILL_COLUMNS.length / 2; i++) {
            values.push(infoArr[i][0], infoArr[i][1]);
        }

        db.run(
            `INSERT INTO snapshotdata (${columns.map(c => `"${c}"`).join(",")}) VALUES (${placeholders});`,
            values,
            function (err) {
                if (err) {
                    return reject(err);
                }
                return resolve(this);
            }
        );
    });
}
exports.recordSnapshot = recordSnapshot;

// Month boundaries as UTC ISO strings — [monthStart, nextMonthStart) —
// matching the capturedAt format written by recordSnapshot.
function currentMonthBounds() {
    var date = new Date();
    var monthStart = new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1)).toISOString();
    var nextMonthStart = new Date(Date.UTC(date.getFullYear(), date.getMonth() + 1, 1)).toISOString();
    return [monthStart, nextMonthStart];
}
exports.currentMonthBounds = currentMonthBounds;

// Range boundaries as UTC ISO strings — [start, end) — for a given
// year/month, matching the capturedAt format written by recordSnapshot.
// `month === "all"` spans the whole `year`; otherwise `month` is 1-12 and
// the range is just that month. Relies on the same December-rollover trick
// currentMonthBounds() does: Date.UTC normalizes an overflowing month
// argument, so passing `month` (1-12) as the end bound's month rolls
// December into next January for free.
function rangeBounds(year, month) {
    if (month === "all") {
        var start = new Date(Date.UTC(year, 0, 1)).toISOString();
        var end = new Date(Date.UTC(year + 1, 0, 1)).toISOString();
        return [start, end];
    }
    var start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
    var end = new Date(Date.UTC(year, month, 1)).toISOString();
    return [start, end];
}
exports.rangeBounds = rangeBounds;

// Resolves with the raw snapshotdata rows, in [start, end), for every
// currently-active user, ordered by username then capturedAt ascending.
// No grouping -- callers (getMainFeed today, a future plot-data query
// tomorrow) shape the rows themselves. Generic (start, end) -> rows
// signature, not coupled to getMainFeed's [username, startRow, endRow]
// shape.
function activeUsernameSnapshotsInRange(start, end) {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM users WHERE active = 1;`, [], (err, rows) => {
            if (err) {
                return reject(err);
            }
            return resolve(rows);
        });
    })
    .then(users => {
        var usernames = users.map((u) => u.username);
        if (usernames.length === 0) {
            return [];
        }

        var params = [...usernames, start, end];
        return new Promise((resolve, reject) => {
            db.all(`SELECT * FROM snapshotdata WHERE (
                username IN (${ usernames.map(() => "?").join(",") }) AND
                capturedAt >= ? AND
                capturedAt < ?
            ) ORDER BY username ASC, capturedAt ASC;`,
            params, (err, rows) => {
                if (err) {
                    console.log("Get snapshotdata error\n");
                    return reject(err);
                };
                return resolve(rows);
            });
        });
    });
}
exports.activeUsernameSnapshotsInRange = activeUsernameSnapshotsInRange;

// Resolves with the sorted list of years (ascending) that have at least one
// snapshotdata row belonging to a currently-active user.
function getAvailableYears() {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT DISTINCT CAST(substr(s.capturedAt, 1, 4) AS INTEGER) AS year
             FROM snapshotdata s
             JOIN users u ON u.username = s.username
             WHERE u.active = 1
             ORDER BY year ASC;`,
            [],
            (err, rows) => {
                if (err) return reject(err);
                return resolve(rows.map(r => r.year));
            }
        );
    });
}
exports.getAvailableYears = getAvailableYears;

// Resolves with per-user time-series points for one skill/metric column,
// in [start, end) for the given year/month range. Rows already arrive
// ORDER BY username ASC, capturedAt ASC from activeUsernameSnapshotsInRange,
// so this is a straight group-by pass -- no re-sorting needed.
function getSkillSeries(year, month, column) {
    var [start, end] = rangeBounds(year, month);
    return activeUsernameSnapshotsInRange(start, end).then(rows => {
        var byUser = new Map();
        for (const row of rows) {
            if (!byUser.has(row.username)) {
                byUser.set(row.username, { username: row.username, points: [] });
            }
            byUser.get(row.username).points.push({ capturedAt: row.capturedAt, value: row[column] });
        }
        return Array.from(byUser.values());
    });
}
exports.getSkillSeries = getSkillSeries;

// Deletes this month's snapshotdata rows for `username` in [start, end).
function deleteSnapshotsForUserInRange(username, start, end) {
    return new Promise((resolve, reject) => {
        db.all(`DELETE FROM snapshotdata WHERE (
            username = ? AND
            capturedAt >= ? AND
            capturedAt < ?);`,
        [username, start, end], (err, rows) => {
            if (err) {
                console.log("User snapshotdata delete error");
                return reject(err);
            };
            return resolve(username)
        });
    });
}
exports.deleteSnapshotsForUserInRange = deleteSnapshotsForUserInRange;
