const db = require("../dbConn.js").db;
const { currentMonthBounds } = require("./snapshots.js");

// Sets `username`'s active flag. Resolves on success; rejects with the
// lookup/update error (or a "not found" error when the username doesn't
// exist) instead of writing a response.
function disableUser(active, fetchUser) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM users WHERE username = ?`, [fetchUser], (err, row) => {
            if (err || row == undefined) {
                console.log("User not found");
                return reject(new Error("Username not found"));
            }

            db.run(`UPDATE users SET active = ? WHERE username = ?;`, [active, fetchUser], (err) => {
                if (err) {
                    console.log("User update error");
                    return reject(err);
                }

                console.log("User update success");
                return resolve();
            });
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

// Resolves with the JSON-ready main-feed array: [username, startRow, endRow]
// triples, sorted by this month's exp gain, descending.
function getMainFeed() {
    var [monthStart, nextMonthStart] = currentMonthBounds();

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
        return resDict;
    });
}
exports.getMainFeed = getMainFeed;

// Resolves with every row of the users table.
function getAllUsers() {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM users;`, [], (err, rows) => {
            if (err) {
                return reject(err);
            }
            return resolve(rows);
        });
    })
    .then(result => {
        console.log("All users query success");
        return result;
    });
}
exports.getAllUsers = getAllUsers;

// Checks that `username` isn't already registered, then inserts a new row
// into users. Rejects with "Username already found" (matching the message
// /users/add has always sent) if the username is already present, without
// touching the table.
function addUser(username, active) {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM users;`, [], (err, rows) => {
            if (err) {
                return reject(err);
            }
            if (rows.some(a => a.username === username)) {
                return reject(new Error("Username already found"));
            }
            return resolve(rows);
        })
    })
    .then(() => {
        return new Promise((resolve, reject) => {
            db.all(`INSERT INTO users (username, active) VALUES (?, ?);`,
            [username, active], (err, rows) => {
                if (err) {
                    return reject(err);
                }
                console.log("Insert new username success");
                return resolve(rows)
            })
        });
    });
}
exports.addUser = addUser;

// Deletes `username`'s row from users.
function deleteUser(username) {
    return new Promise((resolve, reject) => {
        db.all(`DELETE FROM users WHERE username = ?;`,
        [username], (err, rows) => {
            if (err) {
                console.log("User delete error");
                return reject(new Error("User delete error"));
            };
            return resolve(username)
        });
    });
}
exports.deleteUser = deleteUser;
