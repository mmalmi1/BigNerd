'use strict'

// Covers src/db/snapshots.js's rangeBounds and getAvailableYears (new for
// USR-BIG-3 item 1, backend year/month range selection), plus SKILL_KEYS
// and getSkillSeries (new for USR-BIG-3 item 2, the /users/plot endpoint's
// per-skill time-series query).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const RANGE_BOUNDS_FIXTURE = path.join(__dirname, 'fixtures', 'snapshots-rangeBounds-check.js')
const AVAILABLE_YEARS_FIXTURE = path.join(__dirname, 'fixtures', 'snapshots-getAvailableYears-check.js')
const GET_SKILL_SERIES_FIXTURE = path.join(__dirname, 'fixtures', 'snapshots-getSkillSeries-check.js')

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

test('SKILL_KEYS is exactly the 24 skill keys, in the fixed overall-then-skills order', () => {
    // Reuses RANGE_BOUNDS_FIXTURE, which already requires snapshots.js
    // out-of-process (see that fixture's own comment for why this needs to
    // run out-of-process at all) and reports SKILL_KEYS alongside
    // rangeBounds's result.
    const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bignerd-skillkeys-'))
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
        assert.strictEqual(parsed.ok, true, `expected the fixture to succeed: ${JSON.stringify(parsed)}`)

        assert.deepStrictEqual(parsed.result.skillKeys, [
            'overall', 'attack', 'defence', 'strength', 'hitpoints', 'ranged',
            'prayer', 'magic', 'cooking', 'woodcutting', 'fletching', 'fishing',
            'firemaking', 'crafting', 'smithing', 'mining', 'herblore', 'agility',
            'thieving', 'slayer', 'farming', 'runecrafting', 'hunter', 'construction',
        ])
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

test('getSkillSeries groups by user in capturedAt-ascending order (regardless of insertion order), carries the right per-row value, and excludes inactive users', () => {
    const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bignerd-getskillseries-'))
    try {
        const userA = 'skillSeriesUserA'
        const userB = 'skillSeriesUserB'
        const inactiveUser = 'skillSeriesInactiveUser'

        const t1 = '2024-06-01T01:00:00.000Z'
        const t2 = '2024-06-15T01:00:00.000Z'
        const t3 = '2024-06-20T01:00:00.000Z'

        const seed = {
            users: [
                { username: userA, active: 1 },
                { username: userB, active: 1 },
                { username: inactiveUser, active: 0 },
            ],
            snapshots: [
                // userA rows inserted out of capturedAt order (t3, t1, t2)
                // -- the result must still come back t1, t2, t3 because
                // getSkillSeries relies on the SQL ORDER BY, not on
                // insertion order matching query order.
                { username: userA, capturedAt: t3, attackLvl: 30 },
                { username: userA, capturedAt: t1, attackLvl: 10 },
                { username: userA, capturedAt: t2, attackLvl: 20 },
                // userB rows also inserted out of order (t2, t1).
                { username: userB, capturedAt: t2, attackLvl: 99 },
                { username: userB, capturedAt: t1, attackLvl: 88 },
                // inactiveUser has a row in the same range -- must be
                // absent from the result entirely.
                { username: inactiveUser, capturedAt: t1, attackLvl: 999 },
            ],
        }

        const result = spawnSync(
            process.execPath,
            [GET_SKILL_SERIES_FIXTURE, JSON.stringify(seed), '2024', '6', 'attackLvl'],
            {
                cwd: scratchDir,
                encoding: 'utf8',
                timeout: 20000,
            }
        )

        assert.strictEqual(
            result.status,
            0,
            `fixture should exit cleanly; stdout=${result.stdout} stderr=${result.stderr}`
        )

        const lastLine = result.stdout.trim().split('\n').pop()
        const parsed = JSON.parse(lastLine)
        assert.strictEqual(parsed.ok, true, `expected getSkillSeries to succeed: ${JSON.stringify(parsed)}`)

        const usernames = parsed.series.map((s) => s.username)
        assert.ok(usernames.includes(userA), 'expected userA in the series')
        assert.ok(usernames.includes(userB), 'expected userB in the series')
        assert.ok(
            !usernames.includes(inactiveUser),
            'inactive user must be absent from getSkillSeries results'
        )
        assert.strictEqual(parsed.series.length, 2, 'exactly the two active users, no more')

        assert.deepStrictEqual(
            parsed.series.find((s) => s.username === userA).points,
            [
                { capturedAt: t1, value: 10 },
                { capturedAt: t2, value: 20 },
                { capturedAt: t3, value: 30 },
            ],
            'userA points must be capturedAt-ascending with the value from the matching row'
        )
        assert.deepStrictEqual(
            parsed.series.find((s) => s.username === userB).points,
            [
                { capturedAt: t1, value: 88 },
                { capturedAt: t2, value: 99 },
            ],
            'userB points must be capturedAt-ascending with the value from the matching row'
        )
    } finally {
        fs.rmSync(scratchDir, { recursive: true, force: true })
    }
})
