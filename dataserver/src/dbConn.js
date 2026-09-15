const sqlite3 = require('sqlite3').verbose()
const fs = require('fs')
const path = require('path')
const { runMigrations } = require('./migrate.js')
const DBSOURCE = "./sqlite3/sqlite3.db"

fs.mkdirSync(path.dirname(DBSOURCE), { recursive: true })

// Resolves once migrations have genuinely finished (and rejects if they
// fail), so a caller can await schema readiness instead of racing it.
// Built before `new sqlite3.Database(...)` so nothing can settle it early.
let resolveReady, rejectReady;
const ready = new Promise((res, rej) => { resolveReady = res; rejectReady = rej });

const db = new sqlite3.Database(DBSOURCE, (err) => {
    if (err) {
      // Cannot open database
      console.error(err.message)
      rejectReady(err)
      throw err
    }else{
        console.log('Connected to the SQLite database.')
        resolveReady(runMigrations(db))
    }
});

exports.db = db;
exports.ready = ready;