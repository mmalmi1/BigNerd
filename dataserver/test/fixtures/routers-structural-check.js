'use strict'

// Run as a standalone child process (spawned with its cwd set to a scratch
// directory that has no `sqlite3/` subdirectory yet) by
// test/routers-structural.test.js.
//
// argv[2..4] are the absolute paths to the real src/routes/users.js,
// src/routes/auth.js and src/jobs/snapshotCapture.js. Requiring any of them
// transitively requires src/dbConn.js (via src/db/users.js or
// src/db/snapshots.js), which has a real module-level side effect
// (mkdirSync + opening the sqlite3 db against the process's cwd) -- hence
// running this in a scratch-cwd child process, matching the fixture idiom
// in test/dbConn.test.js and test/users.test.js.
//
// This performs real introspection of the real Express Router internals
// (`.stack`) produced by requiring the actual modules -- no mocking.

function report(obj, code) {
    console.log(JSON.stringify(obj))
    process.exit(code)
}

try {
    const USERS_ROUTER_PATH = process.argv[2]
    const AUTH_ROUTER_PATH = process.argv[3]
    const JOBS_PATH = process.argv[4]

    const usersRouter = require(USERS_ROUTER_PATH)
    const authRouter = require(AUTH_ROUTER_PATH)
    const jobs = require(JOBS_PATH)

    const usersRoutes = usersRouter.stack
        .filter((layer) => layer.route)
        .map((layer) => ({
            path: layer.route.path,
            methods: Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]),
        }))

    const authLayerKinds = authRouter.stack.map((layer) => ({
        isRoute: !!layer.route,
        path: layer.route ? layer.route.path : null,
        methods: layer.route ? Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]) : null,
    }))

    const jobsExportsOk =
        typeof jobs.runCaptureForAllUsers === 'function' && typeof jobs.scheduleSnapshotCronJobs === 'function'

    // Real invocation of the real scheduleSnapshotCronJobs -- proves it does
    // not throw synchronously (e.g. an invalid cron pattern). The process
    // exits immediately after via report()/process.exit, regardless of the
    // cron timers scheduleSnapshotCronJobs leaves running.
    let scheduleThrew = null
    try {
        jobs.scheduleSnapshotCronJobs()
    } catch (err) {
        scheduleThrew = err.message
    }

    report({ ok: true, usersRoutes, authLayerKinds, jobsExportsOk, scheduleThrew }, 0)
} catch (err) {
    report({ ok: false, error: err.message, stack: err.stack }, 1)
}
