'use strict'

// Covers dataserver/src/routes/users.js, dataserver/src/routes/auth.js and
// dataserver/src/jobs/snapshotCapture.js -- the modules produced by moving
// dataserver.js's 5 GET routes, its POST /login route, and its
// captureSnapshot/cron wiring out into their own files (vault ticket
// USR-BIG-2, item 2). This codebase has no HTTP-layer test coverage and
// adding an HTTP framework (e.g. supertest) for this refactor was explicit
// out of scope; the implementer already ran and reported a real manual curl
// smoke test against the live server, so this does not repeat that.
//
// What's added here is cheap and permanent instead: a real (no mocking)
// structural regression check that requires each module directly (no
// server boot) and asserts on the actual Express Router internals
// (`.stack`) and job exports it produces. It would catch a real regression
// a future edit could introduce silently -- a dropped or reordered route,
// or express.json() ending up after the /login route within the same
// router (the exact concern a plan-reviewer raised about scoping
// express.json() to authRouter) -- in a way the one-off manual smoke test
// cannot, since that verification is gone the moment its terminal session
// ends.
//
// Requiring these modules transitively requires src/dbConn.js, which has a
// real module-level side effect (creates ./sqlite3/sqlite3.db under the
// process's cwd) -- so, matching the fixture idiom used by
// test/dbConn.test.js and test/users.test.js, the require happens in a
// child process spawned with its cwd set to a scratch directory rather than
// polluting this repo's own dataserver/ directory.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const USERS_ROUTER_PATH = path.join(__dirname, '..', 'src', 'routes', 'users.js')
const AUTH_ROUTER_PATH = path.join(__dirname, '..', 'src', 'routes', 'auth.js')
const JOBS_PATH = path.join(__dirname, '..', 'src', 'jobs', 'snapshotCapture.js')
const FIXTURE = path.join(__dirname, 'fixtures', 'routers-structural-check.js')

// Spawned once and reused by every test below (all in this one file, which
// node:test runs sequentially) -- there is nothing test-specific about the
// fixture's args, so re-running the same child process per assertion would
// only add cost, not coverage.
let cachedResult = null

function structuralFacts() {
    if (cachedResult) return cachedResult

    const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bignerd-routers-structural-'))
    try {
        const result = spawnSync(process.execPath, [FIXTURE, USERS_ROUTER_PATH, AUTH_ROUTER_PATH, JOBS_PATH], {
            cwd: scratchDir,
            encoding: 'utf8',
            timeout: 20000,
        })

        assert.strictEqual(
            result.status,
            0,
            `fixture should exit cleanly; stdout=${result.stdout} stderr=${result.stderr}`
        )

        const lastLine = result.stdout.trim().split('\n').pop()
        const parsed = JSON.parse(lastLine)
        assert.strictEqual(parsed.ok, true, `expected the fixture to complete: ${JSON.stringify(parsed)}`)

        cachedResult = parsed
        return cachedResult
    } finally {
        fs.rmSync(scratchDir, { recursive: true, force: true })
    }
}

test('routes/users.js exports a router with exactly its 6 GET routes, in order, at the expected paths', () => {
    const parsed = structuralFacts()
    assert.deepStrictEqual(parsed.usersRoutes, [
        { path: '/users/add', methods: ['get'] },
        { path: '/users/delete', methods: ['get'] },
        { path: '/users/update', methods: ['get'] },
        { path: '/allusers', methods: ['get'] },
        { path: '/users', methods: ['get'] },
        { path: '/years', methods: ['get'] },
    ])
})

test('routes/auth.js registers express.json() before the /login route, scoped to just this router', () => {
    const parsed = structuralFacts()
    assert.strictEqual(
        parsed.authLayerKinds.length,
        2,
        `expected exactly 2 layers on authRouter.stack: ${JSON.stringify(parsed.authLayerKinds)}`
    )
    assert.strictEqual(
        parsed.authLayerKinds[0].isRoute,
        false,
        'first layer must be the bare express.json() middleware, not a route'
    )
    assert.strictEqual(parsed.authLayerKinds[1].isRoute, true)
    assert.strictEqual(parsed.authLayerKinds[1].path, '/login')
    assert.deepStrictEqual(parsed.authLayerKinds[1].methods, ['post'])
})

test('jobs/snapshotCapture.js exports runCaptureForAllUsers and scheduleSnapshotCronJobs, and scheduling can be invoked without throwing', () => {
    const parsed = structuralFacts()
    assert.strictEqual(parsed.jobsExportsOk, true)
    assert.strictEqual(
        parsed.scheduleThrew,
        null,
        `scheduleSnapshotCronJobs() must not throw: ${parsed.scheduleThrew}`
    )
})

test("dataserver.js mounts usersRouter before authRouter (load-bearing: keeps GET routes from ever reaching authRouter's scoped express.json())", () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'dataserver.js'), 'utf8')
    const usersUseIdx = src.indexOf('app.use(usersRouter)')
    const authUseIdx = src.indexOf('app.use(authRouter)')
    assert.notStrictEqual(usersUseIdx, -1, 'expected app.use(usersRouter) in dataserver.js')
    assert.notStrictEqual(authUseIdx, -1, 'expected app.use(authRouter) in dataserver.js')
    assert.ok(usersUseIdx < authUseIdx, 'usersRouter must be mounted before authRouter')
})
