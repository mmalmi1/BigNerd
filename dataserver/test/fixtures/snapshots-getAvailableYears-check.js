'use strict'

// Run as a standalone child process (spawned with its cwd set to a scratch
// directory that has no `sqlite3/` subdirectory yet) by test/snapshots.test.js.
//
// Same require-out-of-process trick as test/fixtures/dbOperations-getMainFeed-check.js:
// requiring src/dbConn.js and src/db/snapshots.js here (not in the test
// process) is what lets their real, cwd-relative sqlite3/sqlite3.db file run
// against an isolated scratch db.
//
// argv[2] is a JSON-encoded seed spec:
//   { users: [{username, active}], snapshots: [{username, capturedAt}] }
// Rows are inserted in array order. Reports one line of JSON on stdout: the
// getAvailableYears() resolution (an array of years) or rejection.

const path = require('path')

const seed = JSON.parse(process.argv[2])

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
        await runAsync('INSERT INTO snapshotdata (username, capturedAt) VALUES (?, ?)', [
            s.username,
            s.capturedAt,
        ])
    }

    const years = await snapshots.getAvailableYears()

    report({ ok: true, years }, 0)
}

main().catch((err) => report({ ok: false, reason: err.message }, 1))
