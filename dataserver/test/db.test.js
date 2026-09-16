'use strict'

// Regression test for the start/end zip-by-array-index pairing bug
// getMainFeed (dataserver/src/db/users.js) was rewritten to fix. The old
// implementation ran two separate, unordered queries (one against startdata,
// one against enddata) and zipped their result arrays by position, trusting
// that both queries happened to return rows in the same per-user order. The
// new implementation runs one query against the unified snapshotdata table,
// explicitly ordered by username then capturedAt, and groups rows by
// username before deriving each user's start/end snapshot -- so it must get
// the pairing right regardless of insertion order.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const FIXTURE = path.join(__dirname, 'fixtures', 'dbOperations-getMainFeed-check.js')

test("getMainFeed pairs each user's start/end snapshot rows by username, not by array position across an out-of-order insert", () => {
    const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bignerd-mainfeed-'))
    try {
        // currentMonthBounds() (src/db/snapshots.js) builds [monthStart,
        // nextMonthStart) via Date.UTC(date.getFullYear(), date.getMonth(), ...)
        // -- i.e. it feeds *local* year/month numbers into Date.UTC. Mirror
        // that exactly here so these capturedAt values are guaranteed to
        // fall inside the bounds the fixture's own getMainFeed call computes,
        // regardless of the host's timezone.
        const now = new Date()
        const y = now.getFullYear()
        const m = now.getMonth()
        // Days 2-25 stay safely clear of both month edges for every
        // timezone offset, so the exact local/UTC boundary quirk above can
        // never push a row out of the current month.
        const iso = (day, hour) => new Date(Date.UTC(y, m, day, hour, 0, 0)).toISOString()

        const userA = 'mainfeedUserA'
        const userB = 'mainfeedUserB'
        const markerA = 4242
        const markerB = 8484

        // Deliberately out of both capturedAt order and username order: B's
        // earliest row, then A's earliest, then A's latest, then B's latest.
        // An implementation that fetches "start" rows and "end" rows via two
        // independent, unordered queries and zips the two result arrays by
        // index would pair A's start with B's end and vice versa given this
        // insertion order -- exactly the bug this test guards against.
        const snapshots = [
            { username: userB, capturedAt: iso(2, 1), attackLvl: markerB },
            { username: userA, capturedAt: iso(5, 1), attackLvl: markerA },
            { username: userA, capturedAt: iso(20, 1), attackLvl: markerA },
            { username: userB, capturedAt: iso(25, 1), attackLvl: markerB },
        ]

        const seed = {
            users: [
                { username: userA, active: 1 },
                { username: userB, active: 1 },
            ],
            snapshots,
            // getMainFeed now takes an explicit (year, month) instead of
            // always using the current month -- pass the same y/m the
            // capturedAt values above were built from, so this fixture
            // still exercises the current-month range.
            year: y,
            month: m + 1,
        }

        const result = spawnSync(process.execPath, [FIXTURE, JSON.stringify(seed)], {
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
        assert.strictEqual(parsed.ok, true, `expected getMainFeed to succeed: ${JSON.stringify(parsed)}`)

        const body = parsed.body
        assert.strictEqual(body.length, 2, 'both active users should appear in the main feed')

        const byUsername = new Map(body.map((triple) => [triple[0], triple]))
        const expectedMarkers = { [userA]: markerA, [userB]: markerB }

        for (const username of [userA, userB]) {
            const triple = byUsername.get(username)
            assert.ok(triple, `expected a result row for ${username}`)
            const [, startRow, endRow] = triple
            assert.strictEqual(
                startRow.attackLvl,
                expectedMarkers[username],
                `${username}'s start row must carry ${username}'s own marker, not another user's`
            )
            assert.strictEqual(
                endRow.attackLvl,
                expectedMarkers[username],
                `${username}'s end row must carry ${username}'s own marker, not another user's`
            )
        }
    } finally {
        fs.rmSync(scratchDir, { recursive: true, force: true })
    }
})

// USR-BIG-3 item 1: getMainFeed(year, month) generalized rangeBounds/
// activeUsernameSnapshotsInRange to an explicit, arbitrary (year, month)
// instead of always the current month. The three tests below exercise that
// range selection directly -- a single month with data, "all" spanning
// several months of a year, and a range with no data at all -- using fixed
// 2024 dates rather than "now", since the range is no longer tied to the
// current month.

test('getMainFeed sorts a month\'s results by exp gained (end overallExp minus start overallExp) descending', () => {
    const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bignerd-mainfeed-sort-'))
    try {
        const userHighGain = 'mainfeedSortUserHigh'
        const userLowGain = 'mainfeedSortUserLow'

        const snapshots = [
            { username: userLowGain, capturedAt: '2024-05-01T00:00:00.000Z', overallExp: 1000 },
            { username: userHighGain, capturedAt: '2024-05-01T00:00:00.000Z', overallExp: 1000 },
            // userHighGain gains 500 exp this month, userLowGain gains only
            // 100 -- so the sort must put userHighGain first even though it
            // was inserted second and its rows were seeded out of exp order.
            { username: userHighGain, capturedAt: '2024-05-20T00:00:00.000Z', overallExp: 1500 },
            { username: userLowGain, capturedAt: '2024-05-20T00:00:00.000Z', overallExp: 1100 },
        ]

        const seed = {
            users: [
                { username: userHighGain, active: 1 },
                { username: userLowGain, active: 1 },
            ],
            snapshots,
            year: 2024,
            month: 5,
        }

        const result = spawnSync(process.execPath, [FIXTURE, JSON.stringify(seed)], {
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
        assert.strictEqual(parsed.ok, true, `expected getMainFeed to succeed: ${JSON.stringify(parsed)}`)

        const body = parsed.body
        assert.strictEqual(body.length, 2, 'both active users should appear in the main feed')
        assert.strictEqual(body[0][0], userHighGain, 'the bigger exp gain must be sorted first')
        assert.strictEqual(body[1][0], userLowGain, 'the smaller exp gain must be sorted second')
    } finally {
        fs.rmSync(scratchDir, { recursive: true, force: true })
    }
})

test('getMainFeed(year, "all") picks up snapshot rows spanning multiple months of that year, not just one', () => {
    const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bignerd-mainfeed-all-'))
    try {
        const username = 'mainfeedAllYearUser'
        const marker = 1234

        const snapshots = [
            // February and November of the same year -- an implementation
            // that only widened rangeBounds for a single month (or defaulted
            // "all" to some fixed month) would miss one of these.
            { username, capturedAt: '2024-02-10T00:00:00.000Z', attackLvl: marker },
            { username, capturedAt: '2024-11-15T00:00:00.000Z', attackLvl: marker },
            // Outside the 2024 calendar year entirely -- must not be picked
            // up by getMainFeed(2024, "all").
            { username, capturedAt: '2023-12-31T23:59:59.000Z', attackLvl: marker },
            { username, capturedAt: '2025-01-01T00:00:00.000Z', attackLvl: marker },
        ]

        const seed = {
            users: [{ username, active: 1 }],
            snapshots,
            year: 2024,
            month: 'all',
        }

        const result = spawnSync(process.execPath, [FIXTURE, JSON.stringify(seed)], {
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
        assert.strictEqual(parsed.ok, true, `expected getMainFeed to succeed: ${JSON.stringify(parsed)}`)

        const body = parsed.body
        assert.strictEqual(body.length, 1, 'the one active user should appear exactly once')
        const [, startRow, endRow] = body[0]
        assert.strictEqual(startRow.capturedAt, '2024-02-10T00:00:00.000Z', 'the start row must be the earliest row inside 2024, not the one from 2023')
        assert.strictEqual(endRow.capturedAt, '2024-11-15T00:00:00.000Z', 'the end row must be the latest row inside 2024, not the one from 2025')
    } finally {
        fs.rmSync(scratchDir, { recursive: true, force: true })
    }
})

test('getMainFeed returns an empty array, not an error, for a year/month range with zero matching rows', () => {
    const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bignerd-mainfeed-empty-'))
    try {
        const username = 'mainfeedEmptyRangeUser'

        const seed = {
            users: [{ username, active: 1 }],
            // This user has data, but none of it falls in the year/month
            // queried below.
            snapshots: [{ username, capturedAt: '2024-05-15T00:00:00.000Z', attackLvl: 1 }],
            year: 2019,
            month: 3,
        }

        const result = spawnSync(process.execPath, [FIXTURE, JSON.stringify(seed)], {
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
        assert.strictEqual(parsed.ok, true, `expected getMainFeed to succeed (resolve, not reject) on an empty range: ${JSON.stringify(parsed)}`)
        assert.deepStrictEqual(parsed.body, [], 'a range with no matching snapshotdata rows must resolve to an empty array')
    } finally {
        fs.rmSync(scratchDir, { recursive: true, force: true })
    }
})
