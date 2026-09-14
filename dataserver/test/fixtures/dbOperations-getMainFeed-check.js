'use strict'

// Run as a standalone child process (spawned with its cwd set to a scratch
// directory that has no `sqlite3/` subdirectory yet) by test/dbOperations.test.js.
//
// Requiring src/dbConn.js and src/dbOperations.js here -- rather than in the
// test process -- is what lets their real, cwd-relative sqlite3/sqlite3.db
// file and unawaited runMigrations(db) call run against an isolated scratch
// db instead of the real one, the same trick test/fixtures/dbconn-fresh-clone-check.js
// uses for dbConn.js alone.
//
// argv[2] is a JSON-encoded seed spec: { users: [{username, active}],
// snapshots: [{username, capturedAt, attackLvl}] }. Rows are inserted in
// array order -- dbOperations.test.js deliberately orders `snapshots`
// neither by username nor by capturedAt, to exercise getMainFeed's grouping
// rather than any incidental row order. Reports one line of JSON on stdout:
// the getMainFeed response's status code and parsed body, or a failure
// reason.

const path = require('path')

const seed = JSON.parse(process.argv[2])

// Both requires resolve (via Node's module cache, keyed by absolute path)
// to the exact same dbConn.js module -- and therefore the exact same open
// `db` connection -- that dbOperations.js uses internally, so seeding here
// and querying via dbOperations.getMainFeed below share one connection with
// no risk of a second writer racing it.
const dbConn = require(path.join(__dirname, '..', '..', 'src', 'dbConn.js'))
const db = dbConn.db
const dbOperations = require(path.join(__dirname, '..', '..', 'src', 'dbOperations.js'))

function report(obj, code) {
    console.log(JSON.stringify(obj))
    process.exit(code)
}

function runAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            err ? reject(err) : resolve(this)
        })
    })
}

function allAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
    })
}

function waitForSchema(deadline) {
    return allAsync("SELECT name FROM sqlite_master WHERE type='table'").then((rows) => {
        const names = rows.map((r) => r.name)
        if (names.includes('users') && names.includes('snapshotdata')) return
        if (Date.now() > deadline) {
            throw new Error('timed out waiting for schema, tables seen: ' + JSON.stringify(names))
        }
        return new Promise((resolve) => setTimeout(resolve, 50)).then(() => waitForSchema(deadline))
    })
}

async function main() {
    await waitForSchema(Date.now() + 10000)

    for (const u of seed.users) {
        await runAsync('INSERT INTO users (username, active) VALUES (?, ?)', [u.username, u.active])
    }

    for (const s of seed.snapshots) {
        await runAsync('INSERT INTO snapshotdata (username, capturedAt, attackLvl) VALUES (?, ?, ?)', [
            s.username,
            s.capturedAt,
            s.attackLvl,
        ])
    }

    const result = await new Promise((resolve, reject) => {
        const fakeRes = {
            status(code) {
                this._code = code
                return this
            },
            send(body) {
                resolve({ code: this._code, body })
            },
        }
        try {
            dbOperations.getMainFeed(fakeRes)
        } catch (err) {
            reject(err)
        }
    })

    report({ ok: true, code: result.code, body: JSON.parse(result.body) }, 0)
}

main().catch((err) => report({ ok: false, reason: err.message }, 1))
