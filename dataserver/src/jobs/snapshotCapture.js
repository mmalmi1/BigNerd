const hiscores = require("../hiscores.js");
const usersDb = require("../db/users.js");
const snapshots = require("../db/snapshots.js");
const { db, ready } = require("../dbConn.js");
const cron = require('node-cron');

// Shared by both crons below (the 30-min "end" refresh and the
// start-of-month capture): fetches each user's current hiscores and
// records one snapshotdata row via snapshots.recordSnapshot, instead
// of each cron running its own table-specific UPDATE/INSERT SQL.
//
// On a Jagex 404, disables the user — previously only the start-of-month
// path did this and the 30-min cron merely logged the error; this is a
// deliberate behavior change so both crons disable a user consistently
// once their username is no longer found on the hiscores.
const runCaptureForAllUsers = async (users) => {
    for (let i = 0; i < users.length; i++) {
        var username = users[i].username;

        await hiscores.fetchHiscore(username)
        .then(text => {
            var infoArr = hiscores.parseHiscoreRows(text);
            console.log("Recording snapshot for", username);
            return snapshots.recordSnapshot(username, infoArr);
        })
        .catch(err => {
            if (err.message === "Username not found in jagex API") {
                console.log("Username not found in jagex API, disabling user", username);
                usersDb.disableUser(0, username).catch(err => console.log(err.message));
            }
            console.log(err.message);
        });
    };
}

function scheduleSnapshotCronJobs() {
    /*
     Update database every 30 minutes
     */
    cron.schedule('3,33 * * * *', () => {
        console.log('running a task every 3 past AND 27 to');

        var query = new Promise((resolve, reject) => {
            db.all(`SELECT * FROM users;`, [], (err, rows) => {
                if (err) {
                    return reject(err);
                }
                return resolve(rows);
            });
        })
        .then(users=> {
            runCaptureForAllUsers(users);
        })
        .catch(err => console.log(err.message));
    });

    /*
     Update database at the start of the month
     */
    cron.schedule('0 0 1 * *', () => {
        console.log('Start of the month db update');

        var query = new Promise((resolve, reject) => {
            db.all(`SELECT * FROM users;`, [], (err, rows) => {
                if (err) {
                    return reject(err);
                }
                return resolve(rows);
            });
        })
        .then(users=> {
            runCaptureForAllUsers(users);
        })
        .catch(err => console.log(err.message));
    });
}

// Run once on server boot -- same capture logic the 30-minute cron uses,
// so a restart doesn't wait up to 30 minutes for fresh data. Awaits
// `ready` first so the query below can't race the migrations that create
// the `users` table on a fresh clone.
const runStartupCapture = async () => {
    await ready;
    console.log('Running startup snapshot capture');
    const users = await new Promise((resolve, reject) => {
        db.all(`SELECT * FROM users;`, [], (err, rows) => err ? reject(err) : resolve(rows));
    });
    await runCaptureForAllUsers(users);
    console.log('Startup snapshot capture complete');
}

module.exports = { runCaptureForAllUsers, scheduleSnapshotCronJobs, runStartupCapture }
