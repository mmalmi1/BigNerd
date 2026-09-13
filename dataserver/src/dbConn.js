const sqlite3 = require('sqlite3').verbose()
const fs = require('fs')
const path = require('path')
const { runMigrations } = require('./migrate.js')
const DBSOURCE = "./sqlite3/sqlite3.db"

fs.mkdirSync(path.dirname(DBSOURCE), { recursive: true })

const db = new sqlite3.Database(DBSOURCE, (err) => {
    if (err) {
      // Cannot open database
      console.error(err.message)
      throw err
    }else{
        console.log('Connected to the SQLite database.')
        runMigrations(db)
    }
});

exports.db = db;