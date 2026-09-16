'use strict'

// Covers src/db/snapshots.js's rangeBounds and getAvailableYears, both new
// for USR-BIG-3 item 1 (backend year/month range selection).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const RANGE_BOUNDS_FIXTURE = path.join(__dirname, 'fixtures', 'snapshots-rangeBounds-check.js')
const AVAILABLE_YEARS_FIXTURE = path.join(__dirname, 'fixtures', 'snapshots-getAvailableYears-check.js')

test('rangeBounds(year, month) returns exact [start, end) UTC ISO bounds for a mid-year month, the December rollover, and "all"', () => {
    // Pure function, but snapshots.js requires ../dbConn.js at module load
    // time, which has the side effect of creating ./sqlite3/sqlite3.db
    // relative to cwd -- so this still runs out-of-process with cwd set to
    // a scratch dir, matching every other fixture in this suite, even
    // though this check never touches `db` itself.
    const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bignerd-rangebounds-'))
    try {
        const result = spawnSync(process.execPath, [RANGE_BOUNDS_FIXTURE], {
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
        assert.strictEqual(parsed.ok, true, `expected rangeBounds to succeed: ${JSON.stringify(parsed)}`)

        assert.deepStrictEqual(
            parsed.result.midYear,
            ['2024-05-01T00:00:00.000Z', '2024-06-01T00:00:00.000Z'],
            'rangeBounds(2024, 5) should bound just May 2024'
        )
        assert.deepStrictEqual(
            parsed.result.decemberRollover,
            ['2024-12-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'],
            'rangeBounds(2024, 12) should roll the end bound into January 2025'
        )
        assert.deepStrictEqual(
            parsed.result.all,
            ['2024-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'],
            'rangeBounds(2024, "all") should span the whole calendar year 2024'
        )
    } finally {
        fs.rmSync(scratchDir, { recursive: true, force: true })
    }
})

test('getAvailableYears only counts years with snapshotdata belonging to a currently-active user', () => {
    const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bignerd-availyears-'))
    try {
        const activeUser = 'availyearsActiveUser'
        const deactivatedUser = 'availyearsDeactivatedUser'
        const activeYear = 2023
        const deactivatedOnlyYear = 2019

        const seed = {
            users: [
                { username: activeUser, active: 1 },
                { username: deactivatedUser, active: 0 },
            ],
            snapshots: [
                // The active user's data lives only in `activeYear`.
                { username: activeUser, capturedAt: `${activeYear}-03-10T00:00:00.000Z` },
                { username: activeUser, capturedAt: `${activeYear}-08-20T00:00:00.000Z` },
                // The deactivated user's data lives only in
                // `deactivatedOnlyYear` -- no active user has any data
                // there, so that year must not appear in the result.
                { username: deactivatedUser, capturedAt: `${deactivatedOnlyYear}-01-15T00:00:00.000Z` },
            ],
        }

        const result = spawnSync(process.execPath, [AVAILABLE_YEARS_FIXTURE, JSON.stringify(seed)], {
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
        assert.strictEqual(parsed.ok, true, `expected getAvailableYears to succeed: ${JSON.stringify(parsed)}`)

        assert.deepStrictEqual(
            parsed.years,
            [activeYear],
            'getAvailableYears must include the active user\'s year and exclude the deactivated user\'s year'
        )
    } finally {
        fs.rmSync(scratchDir, { recursive: true, force: true })
    }
})
