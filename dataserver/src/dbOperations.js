const db = require("./dbConn.js").db;

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

function disableUser(active, fetchUser, res) {
    const sendResponse = (status, payload) => {
        if (res && typeof res.status === 'function') {
            res.status(status).send(payload);
        }
    };

    db.get(`SELECT * FROM users WHERE username = ?`, [fetchUser], (err, row) => {
        if (err || row == undefined) {
            console.log("User not found");
            sendResponse(403, "Username not found");
            return;
        }

        db.run(`UPDATE users SET active = ? WHERE username = ?;`, [active, fetchUser], (err) => {
            if (err) {
                console.log("User update error");
                sendResponse(403, err.message);
                return;
            }

            console.log("User update success");
            sendResponse(200, '200');
        });
    });
}
exports.disableUser = disableUser;

function sortFunction(a, b) {
    var x = a[2]["overallExp"] - a[1]["overallExp"]; 
    var y = b[2]["overallExp"] - b[1]["overallExp"]; 
    if (x === y) {
        return 0;
    }
    else {
        return (x > y) ? -1 : 1;
    }
}

// Month boundaries as UTC ISO strings — [monthStart, nextMonthStart) —
// matching the capturedAt format written by recordSnapshot.
function currentMonthBounds() {
    var date = new Date();
    var monthStart = new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1)).toISOString();
    var nextMonthStart = new Date(Date.UTC(date.getFullYear(), date.getMonth() + 1, 1)).toISOString();
    return [monthStart, nextMonthStart];
}
exports.currentMonthBounds = currentMonthBounds;

function getMainFeed(res) {
    var [monthStart, nextMonthStart] = currentMonthBounds();

    var query = new Promise((resolve, reject) => {
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

        var params = [...usernames, monthStart, nextMonthStart];
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
    })
    .then(rows => {
        console.log("Users query success");

        // Group this month's snapshots by username, in capturedAt order
        // (guaranteed by the ORDER BY above) — the first row per user is
        // the derived "start", the last is the derived "end" (the same
        // row when a user only has one snapshot this month). Pairing by
        // group rather than by array position across two queries is the
        // fix for the old start/end zip-by-index bug.
        var grouped = new Map();
        for (const row of rows) {
            if (!grouped.has(row.username)) {
                grouped.set(row.username, []);
            }
            grouped.get(row.username).push(row);
        }

        var resDict = [];
        for (const [username, snapshots] of grouped) {
            var startRow = snapshots[0];
            var endRow = snapshots[snapshots.length - 1];

            // Home.jsx reads user[1]["startDay"/"startMonth"/"startYear"]
            // — synthesize those onto the derived start row from its
            // capturedAt, since snapshotdata no longer stores them as
            // columns.
            var startDate = new Date(startRow.capturedAt);
            startRow.startDay = startDate.getUTCDate();
            startRow.startMonth = startDate.getUTCMonth() + 1;
            startRow.startYear = startDate.getUTCFullYear();

            resDict.push([username, startRow, endRow]);
        }
        resDict.sort(sortFunction);
        res.status(200).send(JSON.stringify(resDict));
    })
    .catch(err => res.status(404).send(err.message));
}
exports.getMainFeed = getMainFeed;

function getAllUsers(res) {
    var query = new Promise((resolve, reject) => {
        db.all(`SELECT * FROM users;`, [], (err, rows) => {
            if (err) {
                return reject(err);
            }
            return resolve(rows);
        });
    })
    .then(result=> {
        console.log("All users query success");
        res.status(200).send(JSON.stringify(result));
    })
    .catch(err => res.status(404).send(err.message));
}
exports.getAllUsers = getAllUsers;