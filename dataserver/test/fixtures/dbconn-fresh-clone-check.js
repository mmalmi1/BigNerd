'use strict'

// Run as a standalone child process (spawned with its cwd set to a scratch
// directory that has no `sqlite3/` subdirectory yet) by test/dbConn.test.js.
//
// argv[2] is the absolute path to the real src/dbConn.js. Requiring it runs
// its real module-level side effects (mkdirSync, opening the db, and firing
// off the unawaited runMigrations(db) call) against the process's own cwd.
//
// Because dbConn.js does not await runMigrations before its module finishes
// loading, this script polls the resulting db file (via its own, separate
// connection) until the expected tables show up or a deadline passes, then
// reports the outcome as one line of JSON on stdout.

const fs = require('fs')
const path = require('path')
const sqlite3 = require('sqlite3').verbose()

const DBCONN_PATH = process.argv[2]
// This list only needs to be a subset the polling loop below waits to see
// (via `.every`, not an exact-match) -- matching this fixture's existing
// convention of omitting sqlite_sequence, SQLite's own internal bookkeeping
// table, which the exact-match assertion in dbConn.test.js checks instead.
const EXPECTED_TABLES = ['_migrations', 'admins', 'snapshotdata', 'users']

require(DBCONN_PATH)

function report(obj, code) {
    console.log(JSON.stringify(obj))
    process.exit(code)
}

function poll(deadline) {
    const dbPath = path.join(process.cwd(), 'sqlite3', 'sqlite3.db')

    if (!fs.existsSync(dbPath)) {
        if (Date.now() > deadline) return report({ ok: false, reason: 'db file was never created' }, 1)
        return setTimeout(() => poll(deadline), 50)
    }

    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
            if (Date.now() > deadline) return report({ ok: false, reason: 'could not open db: ' + err.message }, 1)
            return setTimeout(() => poll(deadline), 50)
        }

        db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err2, rows) => {
            db.close()
            if (err2) {
                if (Date.now() > deadline) return report({ ok: false, reason: err2.message }, 1)
                return setTimeout(() => poll(deadline), 50)
            }

            const names = rows.map((r) => r.name).sort()
            const hasAll = EXPECTED_TABLES.every((n) => names.includes(n))
            if (hasAll) return report({ ok: true, tables: names }, 0)
            if (Date.now() > deadline) return report({ ok: false, reason: 'timed out waiting for schema', tables: names }, 1)
            setTimeout(() => poll(deadline), 50)
        })
    })
}

poll(Date.now() + 10000)
