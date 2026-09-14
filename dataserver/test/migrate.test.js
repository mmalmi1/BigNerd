'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const { runMigrations } = require('../src/migrate.js')
const {
    mkScratchDir,
    rmScratchDir,
    openDb,
    openReadOnlyDb,
    closeDb,
    execAsync,
    allAsync,
    runAsync,
} = require('./helpers.js')

const REAL_MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations')
const MIGRATION_FILE = '001_initial_schema.sql'
const LIVE_DB_PATH = path.join(__dirname, '..', 'sqlite3', 'sqlite3.db')
const EXPECTED_TABLES = ['admins', 'enddata', 'startdata', 'users']

// migrate.js's MIGRATIONS_DIR is hardcoded to dataserver/migrations (runMigrations
// takes only `db`, no directory argument), so tests 3 and 4 below prove
// ordering/sequencing and fail-loud behaviour by temporarily dropping extra
// *.sql files into that real directory (never touching the real db — every
// runMigrations() call in this file runs against a scratch/throwaway db) and
// removing them again in a `finally`. This sweep guards against leftovers from
// a previous crashed run so they can never contaminate other tests.
const TEST_MIGRATION_FILENAMES = ['000_test_bad.sql', '002_test_seq_a.sql', '003_test_seq_b.sql']
function sweepTestMigrationFiles() {
    for (const f of TEST_MIGRATION_FILENAMES) {
        fs.rmSync(path.join(REAL_MIGRATIONS_DIR, f), { force: true })
    }
}
sweepTestMigrationFiles()
test.after(sweepTestMigrationFiles)

test('001_initial_schema.sql creates exactly the 4 live tables, with columns matching the live db', async () => {
    // Ground truth comes from the real db itself, read-only, never written to.
    const liveDb = await openReadOnlyDb(LIVE_DB_PATH)
    const liveSchemas = {}
    try {
        const liveTableRows = await allAsync(
            liveDb,
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        const liveTableNames = liveTableRows.map((r) => r.name)
        for (const t of EXPECTED_TABLES) {
            assert.ok(liveTableNames.includes(t), `expected the live db to contain table "${t}"`)
        }
        // Note: the live db may also carry bookkeeping tables (_migrations,
        // sqlite_sequence) if the running server has already applied
        // migrations for real -- that's expected and irrelevant here; only
        // the 4 application tables' column definitions matter below.
        for (const t of EXPECTED_TABLES) {
            liveSchemas[t] = await allAsync(liveDb, `PRAGMA table_info(${t})`)
        }
    } finally {
        await closeDb(liveDb)
    }

    const scratchDir = mkScratchDir()
    const scratchDbPath = path.join(scratchDir, 'scratch.db')
    const scratchDb = await openDb(scratchDbPath)
    try {
        const sql = fs.readFileSync(path.join(REAL_MIGRATIONS_DIR, MIGRATION_FILE), 'utf8')
        await execAsync(scratchDb, sql)

        const tables = await allAsync(scratchDb, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        assert.deepStrictEqual(tables.map((r) => r.name), EXPECTED_TABLES)

        for (const t of EXPECTED_TABLES) {
            const cols = await allAsync(scratchDb, `PRAGMA table_info(${t})`)
            assert.deepStrictEqual(cols, liveSchemas[t], `columns for table "${t}" must match the live schema exactly`)
        }
    } finally {
        await closeDb(scratchDb)
        rmScratchDir(scratchDir)
    }
})

test('runMigrations is idempotent: exactly one ledger row after the first call, none added by the second', async () => {
    const realMigrationFiles = fs.readdirSync(REAL_MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()

    const scratchDir = mkScratchDir()
    const dbPath = path.join(scratchDir, 'scratch.db')
    const db = await openDb(dbPath)
    try {
        await runMigrations(db)
        let rows = await allAsync(db, 'SELECT filename FROM _migrations')
        assert.deepStrictEqual(rows.map((r) => r.filename), realMigrationFiles)

        await assert.doesNotReject(() => runMigrations(db))

        rows = await allAsync(db, 'SELECT filename FROM _migrations')
        assert.deepStrictEqual(rows.map((r) => r.filename), realMigrationFiles, 'no additional rows should appear after a second call')
    } finally {
        await closeDb(db)
        rmScratchDir(scratchDir)
    }
})

test('migrations are applied in sorted filename order, strictly one at a time', async () => {
    const realMigrationFiles = fs.readdirSync(REAL_MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()

    const testFiles = ['002_test_seq_a.sql', '003_test_seq_b.sql']
    fs.writeFileSync(
        path.join(REAL_MIGRATIONS_DIR, testFiles[0]),
        `CREATE TABLE IF NOT EXISTS _test_seq (name TEXT);\nINSERT INTO _test_seq (name) VALUES ('a');\n`
    )
    fs.writeFileSync(
        path.join(REAL_MIGRATIONS_DIR, testFiles[1]),
        // Only succeeds in inserting 'b' if the row from the first file is
        // already visible -- a real mechanical dependency, not just an
        // assertion about claimed ordering.
        `INSERT INTO _test_seq (name) SELECT 'b' WHERE EXISTS (SELECT 1 FROM _test_seq WHERE name = 'a');\n`
    )

    const scratchDir = mkScratchDir()
    const dbPath = path.join(scratchDir, 'scratch.db')
    const db = await openDb(dbPath)

    let inFlight = 0
    let maxInFlight = 0
    const originalExec = db.exec.bind(db)
    db.exec = (sql, cb) => {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        return originalExec(sql, (err) => {
            inFlight--
            cb(err)
        })
    }

    try {
        await runMigrations(db)

        assert.strictEqual(maxInFlight, 1, 'no more than one migration exec() should ever be in flight at once')

        const seqRows = await allAsync(db, 'SELECT name FROM _test_seq ORDER BY rowid')
        assert.deepStrictEqual(
            seqRows.map((r) => r.name),
            ['a', 'b'],
            "the second file's data-dependent insert only succeeds if the first file really ran first"
        )

        const ledger = await allAsync(db, 'SELECT filename FROM _migrations ORDER BY id')
        assert.deepStrictEqual(
            ledger.map((r) => r.filename),
            [...realMigrationFiles, ...testFiles]
        )
    } finally {
        await closeDb(db)
        rmScratchDir(scratchDir)
        for (const f of testFiles) fs.rmSync(path.join(REAL_MIGRATIONS_DIR, f), { force: true })
    }
})

test('a malformed migration file makes runMigrations reject with the underlying SQL error, and is not recorded as applied', async () => {
    const badFile = '000_test_bad.sql'
    fs.writeFileSync(path.join(REAL_MIGRATIONS_DIR, badFile), 'THIS IS NOT VALID SQL;\n')

    const scratchDir = mkScratchDir()
    const dbPath = path.join(scratchDir, 'scratch.db')
    const db = await openDb(dbPath)

    try {
        await assert.rejects(() => runMigrations(db), (err) => {
            assert.match(err.message, /syntax error/i, 'the underlying sqlite error message should surface, not be swallowed')
            return true
        })

        const rows = await allAsync(db, 'SELECT filename FROM _migrations WHERE filename = ?', [badFile])
        assert.strictEqual(rows.length, 0, 'a failed migration must not be recorded as applied')
    } finally {
        await closeDb(db)
        rmScratchDir(scratchDir)
        fs.rmSync(path.join(REAL_MIGRATIONS_DIR, badFile), { force: true })
    }
})

test('runMigrations backfills the ledger onto a pre-existing hand-built schema without altering it', async () => {
    const realMigrationFiles = fs.readdirSync(REAL_MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()

    const scratchDir = mkScratchDir()
    const dbPath = path.join(scratchDir, 'scratch.db')
    const db = await openDb(dbPath)
    try {
        // Simulate a db that predates the migration runner: the 4 tables exist
        // (created directly from the migration SQL, standing in for the live
        // schema) but there is no _migrations table yet.
        const sql = fs.readFileSync(path.join(REAL_MIGRATIONS_DIR, MIGRATION_FILE), 'utf8')
        await execAsync(db, sql)
        await runAsync(db, 'INSERT INTO users (username, active) VALUES (?, ?)', ['seed-user', 1])

        const tablesBefore = await allAsync(db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        assert.deepStrictEqual(tablesBefore.map((r) => r.name), EXPECTED_TABLES)

        await runMigrations(db)

        const migrationRows = await allAsync(db, 'SELECT filename FROM _migrations')
        assert.deepStrictEqual(migrationRows.map((r) => r.filename), realMigrationFiles)

        const tablesAfter = await allAsync(db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        const tableNamesAfter = tablesAfter.map((r) => r.name)
        // 002_snapshotdata.sql really ran here (this db had no _migrations
        // ledger yet), collapsing startdata/enddata into snapshotdata --
        // sqlite_sequence is SQLite's own internal bookkeeping table, created
        // automatically as a side effect of _migrations' AUTOINCREMENT column.
        assert.ok(!tableNamesAfter.includes('startdata'), 'startdata must be dropped by 002_snapshotdata.sql')
        assert.ok(!tableNamesAfter.includes('enddata'), 'enddata must be dropped by 002_snapshotdata.sql')
        assert.deepStrictEqual(
            tableNamesAfter.sort(),
            ['_migrations', 'admins', 'snapshotdata', 'sqlite_sequence', 'users'].sort(),
            'backfilling must not drop, rename or duplicate any pre-existing table beyond the expected startdata/enddata collapse'
        )

        const userRows = await allAsync(db, 'SELECT username, active FROM users')
        assert.deepStrictEqual(userRows, [{ username: 'seed-user', active: 1 }], 'pre-existing data must survive backfill untouched')
    } finally {
        await closeDb(db)
        rmScratchDir(scratchDir)
    }
})

// The 48 skill Lvl/Exp columns, in the order both startdata/enddata (001)
// and snapshotdata (002) declare them -- kept as a literal here (rather than
// imported from src/dbOperations.js) so this test exercises the migration
// SQL's own column order, not whatever the application code happens to
// agree with it about.
const SNAPSHOTDATA_SKILL_COLUMNS = [
    'overallLvl', 'overallExp',
    'attackLvl', 'attackExp',
    'defenceLvl', 'defenceExp',
    'strengthLvl', 'strengthExp',
    'hitpointsLvl', 'hitpointsExp',
    'rangedLvl', 'rangedExp',
    'prayerLvl', 'prayerExp',
    'magicLvl', 'magicExp',
    'cookingLvl', 'cookingExp',
    'woodcuttingLvl', 'woodcuttingExp',
    'fletchingLvl', 'fletchingExp',
    'fishingLvl', 'fishingExp',
    'firemakingLvl', 'firemakingExp',
    'craftingLvl', 'craftingExp',
    'smithingLvl', 'smithingExp',
    'miningLvl', 'miningExp',
    'herbloreLvl', 'herbloreExp',
    'agilityLvl', 'agilityExp',
    'thievingLvl', 'thievingExp',
    'slayerLvl', 'slayerExp',
    'farmingLvl', 'farmingExp',
    'runecraftingLvl', 'runecraftingExp',
    'hunterLvl', 'hunterExp',
    'constructionLvl', 'constructionExp',
]

test('002_snapshotdata.sql collapses startdata/enddata into one capturedAt-ordered snapshotdata table', async () => {
    const scratchDir = mkScratchDir()
    const dbPath = path.join(scratchDir, 'scratch.db')
    const db = await openDb(dbPath)
    try {
        const sql001 = fs.readFileSync(path.join(REAL_MIGRATIONS_DIR, MIGRATION_FILE), 'utf8')
        await execAsync(db, sql001)

        // One startdata row and one enddata row for the same user, on the
        // same calendar day -- the exact scenario the migration's comment
        // says its 00:00:00/23:59:59 split is meant to disambiguate.
        const startValues = SNAPSHOTDATA_SKILL_COLUMNS.map((_, i) => i + 1)
        startValues[0] = 100 // overallLvl marker for the startdata-derived row
        const endValues = SNAPSHOTDATA_SKILL_COLUMNS.map((_, i) => i + 1000)
        endValues[0] = 200 // overallLvl marker for the enddata-derived row

        await runAsync(
            db,
            `INSERT INTO startdata (id, username, startDay, startMonth, startYear, ${SNAPSHOTDATA_SKILL_COLUMNS.join(',')}) VALUES (?, ?, ?, ?, ?, ${SNAPSHOTDATA_SKILL_COLUMNS.map(() => '?').join(',')})`,
            ['s1', 'migtestuser', 15, 6, 2024, ...startValues]
        )
        await runAsync(
            db,
            `INSERT INTO enddata (id, username, endDay, endMonth, endYear, ${SNAPSHOTDATA_SKILL_COLUMNS.join(',')}) VALUES (?, ?, ?, ?, ?, ${SNAPSHOTDATA_SKILL_COLUMNS.map(() => '?').join(',')})`,
            ['e1', 'migtestuser', 15, 6, 2024, ...endValues]
        )

        const sql002 = fs.readFileSync(path.join(REAL_MIGRATIONS_DIR, '002_snapshotdata.sql'), 'utf8')
        await execAsync(db, sql002)

        const cols = await allAsync(db, 'PRAGMA table_info(snapshotdata)')
        assert.deepStrictEqual(
            cols.map((c) => c.name),
            ['id', 'username', 'capturedAt', ...SNAPSHOTDATA_SKILL_COLUMNS],
            'snapshotdata columns must match the migration file exactly, in order'
        )

        const rows = await allAsync(db, 'SELECT * FROM snapshotdata ORDER BY capturedAt ASC')
        assert.strictEqual(rows.length, 2, 'both the startdata and enddata row must have migrated')

        const [startRow, endRow] = rows
        assert.strictEqual(startRow.overallLvl, 100, 'the earlier row must be the ex-startdata row')
        assert.strictEqual(endRow.overallLvl, 200, 'the later row must be the ex-enddata row')
        for (let i = 0; i < SNAPSHOTDATA_SKILL_COLUMNS.length; i++) {
            const col = SNAPSHOTDATA_SKILL_COLUMNS[i]
            assert.strictEqual(startRow[col], startValues[i], `startRow.${col} must match its startdata source`)
            assert.strictEqual(endRow[col], endValues[i], `endRow.${col} must match its enddata source`)
        }
        assert.ok(
            startRow.capturedAt < endRow.capturedAt,
            'the ex-startdata row must sort strictly before the ex-enddata row despite sharing a calendar day'
        )
        assert.strictEqual(startRow.capturedAt, '2024-06-15T00:00:00.000Z')
        assert.strictEqual(endRow.capturedAt, '2024-06-15T23:59:59.999Z')

        const tableNames = (
            await allAsync(db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        ).map((r) => r.name)
        assert.ok(!tableNames.includes('startdata'), 'startdata must be dropped')
        assert.ok(!tableNames.includes('enddata'), 'enddata must be dropped')
    } finally {
        await closeDb(db)
        rmScratchDir(scratchDir)
    }
})
