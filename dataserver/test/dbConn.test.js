'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const DBCONN_PATH = path.join(__dirname, '..', 'src', 'dbConn.js')
const CHECK_SCRIPT = path.join(__dirname, 'fixtures', 'dbconn-fresh-clone-check.js')
const READY_CHECK_SCRIPT = path.join(__dirname, 'fixtures', 'dbconn-ready-check.js')

test('requiring dbConn.js from a fresh-clone cwd (no sqlite3/ subdir) creates the dir, the db file, and the schema', () => {
    const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bignerd-freshclone-'))
    try {
        assert.strictEqual(
            fs.existsSync(path.join(scratchDir, 'sqlite3')),
            false,
            'sanity check: the scratch cwd must not already have a sqlite3/ subdirectory'
        )

        // Real child process, real require() of the real dbConn.js, real
        // sqlite3 db file on disk -- nothing mocked. This is also what proves
        // requiring it does not throw SQLITE_CANTOPEN/ENOENT: a throw during
        // module load would make the child process exit non-zero before ever
        // reaching the polling script's own report.
        const result = spawnSync(process.execPath, [CHECK_SCRIPT, DBCONN_PATH], {
            cwd: scratchDir,
            encoding: 'utf8',
            timeout: 15000,
        })

        assert.strictEqual(
            result.status,
            0,
            `child process should exit cleanly (no thrown SQLITE_CANTOPEN/ENOENT); stdout=${result.stdout} stderr=${result.stderr}`
        )

        const lastLine = result.stdout.trim().split('\n').pop()
        const parsed = JSON.parse(lastLine)
        assert.strictEqual(parsed.ok, true, `expected schema to be created: ${JSON.stringify(parsed)}`)
        // sqlite_sequence is SQLite's own internal bookkeeping table, created
        // automatically as a side effect of _migrations' AUTOINCREMENT column.
        assert.deepStrictEqual(parsed.tables, ['_migrations', 'admins', 'snapshotdata', 'sqlite_sequence', 'users'])

        assert.strictEqual(fs.existsSync(path.join(scratchDir, 'sqlite3')), true)
        assert.strictEqual(fs.existsSync(path.join(scratchDir, 'sqlite3', 'sqlite3.db')), true)
    } finally {
        fs.rmSync(scratchDir, { recursive: true, force: true })
    }
})

test('dbConn.ready resolves only once migrations have genuinely finished: the schema is already queryable the instant it resolves, with no poll/retry needed', () => {
    const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bignerd-freshclone-ready-'))
    try {
        assert.strictEqual(
            fs.existsSync(path.join(scratchDir, 'sqlite3')),
            false,
            'sanity check: the scratch cwd must not already have a sqlite3/ subdirectory'
        )

        // Real child process, real require() of the real dbConn.js, a real
        // await of the real `ready` promise, then exactly one schema query --
        // no polling loop. If `ready` resolved before runMigrations actually
        // finished, this would be a genuine race and could see a missing table.
        const result = spawnSync(process.execPath, [READY_CHECK_SCRIPT, DBCONN_PATH], {
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
        assert.strictEqual(
            parsed.ok,
            true,
            `expected _migrations, users and snapshotdata to already exist the instant ready resolved: ${JSON.stringify(parsed)}`
        )
        // sqlite_sequence is SQLite's own internal bookkeeping table, created
        // automatically as a side effect of _migrations' AUTOINCREMENT column.
        assert.deepStrictEqual(parsed.tables, ['_migrations', 'admins', 'snapshotdata', 'sqlite_sequence', 'users'])
    } finally {
        fs.rmSync(scratchDir, { recursive: true, force: true })
    }
})
