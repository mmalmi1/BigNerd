'use strict'

// Run as a standalone child process (spawned with its cwd set to a scratch
// directory that has no `sqlite3/` subdirectory yet) by test/snapshotCapture.test.js.
//
// This is the counterpart to dbconn-ready-check.js, but for
// runStartupCapture itself rather than dbConn.ready directly: it requires
// the real snapshotCapture.js (which in turn requires the real dbConn.js,
// firing off the unawaited runMigrations(db) call as a side effect of the
// require) and calls runStartupCapture() as the very first thing after
// that require, with no poll/retry loop. If runStartupCapture's internal
// `await ready` were missing or ran too late, the `SELECT * FROM users`
// query inside it would race the migrations that create the `users` table
// on a fresh clone and fail with a "no such table: users" style error.
//
// The scratch db starts with zero users, so runCaptureForAllUsers's loop
// body never executes and this never reaches the real network.
//
// argv[2] is the absolute path to the real src/jobs/snapshotCapture.js.

const SNAPSHOT_CAPTURE_PATH = process.argv[2]

function report(obj, code) {
    console.log(JSON.stringify(obj))
    process.exit(code)
}

async function main() {
    const { runStartupCapture } = require(SNAPSHOT_CAPTURE_PATH)

    // The whole point under test: this must not throw/reject with a
    // missing-table error, which is what would happen if the `SELECT *
    // FROM users` query ran ahead of migrations finishing.
    await runStartupCapture()

    report({ ok: true }, 0)
}

main().catch((err) => report({ ok: false, error: err.message }, 1))
