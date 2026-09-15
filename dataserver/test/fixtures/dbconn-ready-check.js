'use strict'

// Run as a standalone child process (spawned with its cwd set to a scratch
// directory that has no `sqlite3/` subdirectory yet) by test/dbConn.test.js.
//
// This is the counterpart to dbconn-fresh-clone-check.js: that fixture polls
// the db file because it has nothing to await. This fixture instead awaits
// the new `dbConn.ready` promise and then queries the schema exactly once,
// with no poll/retry loop -- proving `ready` resolving really does mean the
// migrations have already finished (not just "probably soon"), which is the
// entire reason that promise exists (so a later caller, e.g. the startup
// snapshot capture, can await it on a fresh clone with no race).
//
// argv[2] is the absolute path to the real src/dbConn.js.

const path = require('path')
const sqlite3 = require('sqlite3').verbose()

const DBCONN_PATH = process.argv[2]
const EXPECTED_TABLES = ['_migrations', 'admins', 'snapshotdata', 'sqlite_sequence', 'users']

function report(obj, code) {
    console.log(JSON.stringify(obj))
    process.exit(code)
}

async function main() {
    const dbConn = require(DBCONN_PATH)

    // The whole point under test: await ready, then check the schema with
    // no retry loop below. If `ready` resolved before migrations actually
    // finished, this query would race them and could see a missing table.
    await dbConn.ready

    // A second, independent read-only connection to the same on-disk file
    // (not the `db` object dbConn.js itself opened) -- so this proves the
    // schema is durably on disk the instant `ready` resolves, not merely
    // visible on the connection that wrote it.
    const dbPath = path.join(process.cwd(), 'sqlite3', 'sqlite3.db')
    const readDb = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) return report({ ok: false, reason: 'could not open db: ' + err.message }, 1)

        readDb.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err2, rows) => {
            readDb.close()
            if (err2) return report({ ok: false, reason: err2.message }, 1)

            const names = rows.map((r) => r.name).sort()
            const hasAll = EXPECTED_TABLES.every((n) => names.includes(n))
            report({ ok: hasAll, tables: names }, hasAll ? 0 : 1)
        })
    })
}

main().catch((err) => report({ ok: false, reason: err.message }, 1))
