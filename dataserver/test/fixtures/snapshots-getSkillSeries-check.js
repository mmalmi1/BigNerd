'use strict'

// Run as a standalone child process (spawned with its cwd set to a scratch
// directory that has no `sqlite3/` subdirectory yet) by test/snapshots.test.js.
//
// Same require-out-of-process trick as
// test/fixtures/snapshots-getAvailableYears-check.js: requiring
// src/dbConn.js and src/db/snapshots.js here (not in the test process) is
// what lets their real, cwd-relative sqlite3/sqlite3.db file run against an
// isolated scratch db.
//
// argv[2] is a JSON-encoded seed spec:
//   { users: [{username, active}], snapshots: [{username, capturedAt, attackLvl}] }
// Rows are inserted in array order -- deliberately NOT capturedAt-ascending
// per user, to prove getSkillSeries's per-user ordering comes from the SQL
// query (ORDER BY username ASC, capturedAt ASC in
// activeUsernameSnapshotsInRange), not from insertion order.
// argv[3..5] are year, month, column passed straight through to
// getSkillSeries.
//
// Reports one line of JSON on stdout: the getSkillSeries() resolution
// (an array of {username, points}) or rejection.

const path = require('path')

const seed = JSON.parse(process.argv[2])
const year = Number(process.argv[3])
const month = process.argv[4] === 'all' ? 'all' : Number(process.argv[4])
const column = process.argv[5]

const dbConn = require(path.join(__dirname, '..', '..', 'src', 'dbConn.js'))
const db = dbConn.db
const snapshots = require(path.join(__dirname, '..', '..', 'src', 'db', 'snapshots.js'))

function report(obj, code) {
    console.log(JSON.stringify(obj))
    process.exit(code)
}

function runAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            err ? reject(err) : resolve(this)
        })
    })
}

async function main() {
    await dbConn.ready

    for (const u of seed.users) {
        await runAsync('INSERT INTO users (username, active) VALUES (?, ?)', [u.username, u.active])
    }

    for (const s of seed.snapshots) {
        await runAsync(
            'INSERT INTO snapshotdata (username, capturedAt, attackLvl) VALUES (?, ?, ?)',
            [s.username, s.capturedAt, s.attackLvl]
        )
    }

    const series = await snapshots.getSkillSeries(year, month, column)

    report({ ok: true, series }, 0)
}

main().catch((err) => report({ ok: false, reason: err.message }, 1))
