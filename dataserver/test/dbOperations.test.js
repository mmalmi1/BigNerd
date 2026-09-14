'use strict'

// Regression test for the start/end zip-by-array-index pairing bug
// getMainFeed (dataserver/src/dbOperations.js) was rewritten to fix. The old
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
        // currentMonthBounds() (src/dbOperations.js) builds [monthStart,
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
        assert.strictEqual(parsed.code, 200)

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
