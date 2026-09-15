'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const SNAPSHOT_CAPTURE_PATH = path.join(__dirname, '..', 'src', 'jobs', 'snapshotCapture.js')
const CHECK_SCRIPT = path.join(__dirname, 'fixtures', 'snapshotCapture-startup-check.js')

test('runStartupCapture awaits dbConn.ready before querying users, so it does not race migrations on a fresh clone (no such table: users)', () => {
    const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bignerd-startupcapture-'))
    try {
        assert.strictEqual(
            fs.existsSync(path.join(scratchDir, 'sqlite3')),
            false,
            'sanity check: the scratch cwd must not already have a sqlite3/ subdirectory'
        )

        // Real child process, real require() of the real snapshotCapture.js
        // (and, transitively, the real dbConn.js), a real call to
        // runStartupCapture() with no polling/retry -- nothing mocked. The
        // scratch db starts with zero users, so runCaptureForAllUsers's loop
        // body never executes and this never hits the live Jagex API.
        const result = spawnSync(process.execPath, [CHECK_SCRIPT, SNAPSHOT_CAPTURE_PATH], {
            cwd: scratchDir,
            encoding: 'utf8',
            timeout: 15000,
        })

        assert.strictEqual(
            result.status,
            0,
            `child process should exit cleanly; stdout=${result.stdout} stderr=${result.stderr}`
        )

        const lastLine = result.stdout.trim().split('\n').pop()
        const parsed = JSON.parse(lastLine)
        assert.strictEqual(parsed.ok, true, `expected runStartupCapture to resolve without racing migrations: ${JSON.stringify(parsed)}`)
    } finally {
        fs.rmSync(scratchDir, { recursive: true, force: true })
    }
})

// Proving app.listen genuinely never waits on runStartupCapture would need
// runStartupCapture to take long enough, in a real boot, for the ordering to
// be observable -- with the scratch db's zero users, both finish near-
// instantly regardless of whether they're sequenced, so it wouldn't actually
// exercise the fire-and-forget wiring. Making it take real time would mean
// seeding a real user and depending on a live round trip to the Jagex
// hiscores API, which is the same call this codebase already declines to
// depend on in tests (see hiscores.test.js's judgment on fetchHiscore) --
// and mocking node-cron/express to fake that timing would violate the
// no-mocking rule. So, matching the "dataserver.js mounts usersRouter before
// authRouter" structural test in routers-structural.test.js (same
// technique, same class of ordering-that-a-black-box-boot-test can't easily
// pin down), this instead asserts on the real source text: that
// runStartupCapture() is invoked with no `await` in front of it, and before
// app.listen(...). That's what actually makes app.listen's own async setup
// start immediately rather than queue up behind the capture; the
// implementer's 3x manual `npm start` boot-order check demonstrated the
// resulting runtime behavior once, this is what's left as a permanent,
// real (no-mocking) regression guard against someone later "fixing" this by
// adding `await` back.
test('dataserver.js calls runStartupCapture() without awaiting it, before app.listen (fire-and-forget: a slow or failing startup capture must never delay the server binding its port)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'dataserver.js'), 'utf8')
    const callIdx = src.indexOf('runStartupCapture()')
    const listenIdx = src.indexOf('app.listen(')

    assert.notStrictEqual(callIdx, -1, 'expected a runStartupCapture() call in dataserver.js')
    assert.notStrictEqual(listenIdx, -1, 'expected an app.listen( call in dataserver.js')
    assert.ok(
        callIdx < listenIdx,
        'runStartupCapture() must be called before app.listen, so app.listen is never queued up behind it'
    )

    const textBeforeCall = src.slice(0, callIdx).trimEnd()
    assert.ok(
        !/\bawait\s*$/.test(textBeforeCall),
        'runStartupCapture() must not be awaited at the top level -- awaiting it would block app.listen until the capture (which can call the live hiscores API once per user) finishes'
    )
})
