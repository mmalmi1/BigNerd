'use strict'

// Run as a standalone child process (spawned with its cwd set to a scratch
// directory that has no `sqlite3/` subdirectory yet) by test/users.test.js.
//
// Requiring src/dbConn.js and src/db/users.js here -- rather than in the
// test process -- is what lets their real, cwd-relative sqlite3/sqlite3.db
// file run against an isolated scratch db instead of the real one, the same
// trick test/fixtures/dbOperations-getMainFeed-check.js uses for
// src/db/users.js's getMainFeed. Waits for schema readiness via the new
// `dbConn.ready` promise instead of a polling loop -- exactly the usage
// that promise exists to enable.
//
// argv[2] is a JSON-encoded spec: { existingUsername, newUsername, active }.
// Reports one line of JSON on stdout describing what addUser actually did:
// whether the duplicate attempt was rejected and with what message, and the
// users table's actual rows afterward.

const path = require('path')

const spec = JSON.parse(process.argv[2])

const dbConn = require(path.join(__dirname, '..', '..', 'src', 'dbConn.js'))
const db = dbConn.db
const usersDb = require(path.join(__dirname, '..', '..', 'src', 'db', 'users.js'))

function report(obj, code) {
    console.log(JSON.stringify(obj))
    process.exit(code)
}

function allAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
    })
}

async function main() {
    await dbConn.ready

    // The table is empty at this point in a fresh scratch db, so this first
    // insert of the "existing" username must succeed.
    await usersDb.addUser(spec.existingUsername, spec.active)

    // A second insert of the same username must reject, without touching
    // the table.
    let duplicateAttempt = { rejected: false }
    try {
        await usersDb.addUser(spec.existingUsername, spec.active)
        duplicateAttempt = { rejected: false }
    } catch (err) {
        duplicateAttempt = { rejected: true, message: err.message }
    }

    // A genuinely new username must succeed.
    await usersDb.addUser(spec.newUsername, spec.active)

    const existingUserRows = await allAsync('SELECT username, active FROM users WHERE username = ?', [spec.existingUsername])
    const newUserRows = await allAsync('SELECT username, active FROM users WHERE username = ?', [spec.newUsername])

    report({
        ok: true,
        duplicateAttempt,
        existingUserRows,
        newUserRows,
    }, 0)
}

main().catch((err) => report({ ok: false, reason: err.message }, 1))
