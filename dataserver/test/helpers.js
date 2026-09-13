'use strict'

// Shared, minimal promise wrappers around the real `sqlite3` driver, used only
// by the tests. Deliberately independent of src/migrate.js's own wrappers so
// the tests aren't exercising the implementation's helpers, just its
// observable behaviour.

const fs = require('fs')
const os = require('os')
const path = require('path')
const sqlite3 = require('sqlite3').verbose()

function mkScratchDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix || 'bignerd-migrate-'))
}

function rmScratchDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true })
}

function openDb(dbPath) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => (err ? reject(err) : resolve(db)))
    })
}

function openReadOnlyDb(dbPath) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => (err ? reject(err) : resolve(db)))
    })
}

function closeDb(db) {
    return new Promise((resolve, reject) => {
        db.close((err) => (err ? reject(err) : resolve()))
    })
}

function execAsync(db, sql) {
    return new Promise((resolve, reject) => {
        db.exec(sql, (err) => (err ? reject(err) : resolve()))
    })
}

function allAsync(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
    })
}

function runAsync(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            err ? reject(err) : resolve(this)
        })
    })
}

module.exports = {
    mkScratchDir,
    rmScratchDir,
    openDb,
    openReadOnlyDb,
    closeDb,
    execAsync,
    allAsync,
    runAsync,
    sqlite3,
}
