const fs = require('fs')
const path = require('path')

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations')

// Promise wrappers: sqlite3's driver is callback-based and its methods
// return `this` synchronously (not a Promise), so every call must be
// wrapped like this before being awaited.
const execAsync = (db, sql) => new Promise((resolve, reject) => {
    db.exec(sql, (err) => err ? reject(err) : resolve())
})

const allAsync = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows))
})

const runAsync = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this) })
})

// Applies any .sql files under dataserver/migrations/ that are not yet
// recorded in the _migrations ledger table, in filename order, recording
// each as it succeeds. Uses `CREATE TABLE IF NOT EXISTS` in the migration
// files themselves, so re-running against an already-populated database is
// a no-op for tables that already exist — note that this means schema
// drift between a migration file and a real, already-existing table is
// NOT detected; that is an accepted limitation of this approach.
async function runMigrations(db) {
    await execAsync(db, `
        CREATE TABLE IF NOT EXISTS _migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT UNIQUE NOT NULL,
            applied_at TEXT NOT NULL
        )
    `)

    const files = fs.readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .sort()

    const appliedRows = await allAsync(db, 'SELECT filename FROM _migrations')
    const applied = new Set(appliedRows.map((r) => r.filename))

    for (const file of files) {
        if (applied.has(file)) {
            continue
        }

        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
        await execAsync(db, sql)
        await runAsync(
            db,
            'INSERT INTO _migrations (filename, applied_at) VALUES (?, ?)',
            [file, new Date().toISOString()]
        )
    }
}

module.exports = { runMigrations }
