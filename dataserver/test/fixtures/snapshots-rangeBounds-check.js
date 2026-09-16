'use strict'

// Run as a standalone child process (spawned with its cwd set to a scratch
// directory that has no `sqlite3/` subdirectory yet) by test/snapshots.test.js.
//
// rangeBounds(year, month) itself is pure (no db access), but it lives in
// src/db/snapshots.js, which requires ../dbConn.js at module load time --
// and dbConn.js's module-level side effect is mkdirSync + opening
// ./sqlite3/sqlite3.db relative to cwd (see dbconn-fresh-clone-check.js).
// Running this out-of-process with cwd set to a scratch dir is what keeps
// that side effect off the real repo checkout, matching every other fixture
// in this suite -- even though this particular check never awaits readiness
// or touches `db`, since rangeBounds itself never does either.
//
// Reports one line of JSON on stdout: rangeBounds's result for a fixed set
// of (year, month) cases.

const path = require('path')

const snapshots = require(path.join(__dirname, '..', '..', 'src', 'db', 'snapshots.js'))

function report(obj, code) {
    console.log(JSON.stringify(obj))
    process.exit(code)
}

try {
    const result = {
        midYear: snapshots.rangeBounds(2024, 5),
        decemberRollover: snapshots.rangeBounds(2024, 12),
        all: snapshots.rangeBounds(2024, 'all'),
    }
    report({ ok: true, result }, 0)
} catch (err) {
    report({ ok: false, reason: err.message }, 1)
}
