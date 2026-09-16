'use strict'

// Covers src/db/users.js's addUser: previously this existence-check-then-
// insert logic lived inline in dataserver.js, untested either way. Proves,
// against a real isolated sqlite db (the same child-process/scratch-cwd
// fixture idiom as test/db.test.js), that a fresh username is really
// inserted and readable back, and that a duplicate username is rejected
// with the exact message /users/add has always sent, without leaving a
// second row behind.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const FIXTURE = path.join(__dirname, 'fixtures', 'users-addUser-check.js')

test('addUser inserts a fresh username, and rejects a duplicate with "Username already found" without creating a duplicate row', () => {
    const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bignerd-adduser-'))
    try {
        const spec = {
            existingUsername: 'adduserExistingUser',
            newUsername: 'adduserFreshUser',
            active: 1,
        }

        const result = spawnSync(process.execPath, [FIXTURE, JSON.stringify(spec)], {
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
        assert.strictEqual(parsed.ok, true, `expected the fixture scenario to complete: ${JSON.stringify(parsed)}`)

        assert.strictEqual(parsed.duplicateAttempt.rejected, true, 'inserting an already-present username must reject')
        assert.strictEqual(parsed.duplicateAttempt.message, 'Username already found')

        assert.strictEqual(parsed.existingUserRows.length, 1, 'the duplicate attempt must not create a second row for the same username')
        assert.deepStrictEqual(parsed.existingUserRows[0], { username: spec.existingUsername, active: spec.active })

        assert.strictEqual(parsed.newUserRows.length, 1, 'a genuinely new username must be inserted')
        assert.deepStrictEqual(parsed.newUserRows[0], { username: spec.newUsername, active: spec.active })
    } finally {
        fs.rmSync(scratchDir, { recursive: true, force: true })
    }
})
