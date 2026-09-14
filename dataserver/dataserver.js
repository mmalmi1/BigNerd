const express = require("express")
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const bcrypt = require("bcrypt")
const cron = require('node-cron');
const jwt = require("jsonwebtoken");
const dbOperations = require("./src/dbOperations.js");

require('dotenv').config()
console.log(`${process.env.JWTPRIVATEKEY}`);
//bcrypt.hash("pass", 10).then(hash => console.log(hash));

// Import middlewares
const auth = require("./middleware/auth");
const { admin } = require("./middleware/roles");

const app = express()
const db = require("./src/dbConn.js").db;


app.get("/users/add", [auth, admin], (req, res) => {
    var fetchUser = req.query.username;
    var stats = null;
    var infoArr = [];

    if (fetchUser === undefined) {
        res.status(404).send("Undefined user");
        return;
    }
    fetch(`https://secure.runescape.com/m=hiscore_oldschool/index_lite.ws?player=${fetchUser}`, {method: 'GET', headers: {}})
        .then(res => {
            if (!res.ok) {
                throw new Error("Username not found in jagex API");
            }
            return res.text()
        })
        .then(body => {
            console.log("Checking if username already is in db")
            stats = body; 
            var query = new Promise((resolve, reject) => {
                db.all(`SELECT * FROM users;`, [], (err, rows) => {
                    if (err) {
                        return reject(err);
                    };
                    if (rows.some(a => a.username === fetchUser)) {
                        return reject(new Error("Username already found"));
                    };
                    return resolve(rows);
                })
            })
            return query;
        })
        .then(resolved => {
            console.log("Inserting user", fetchUser);
            var insert = new Promise((resolve, reject) => {
                db.all(`INSERT INTO users (username, active) VALUES (?, ?);`,
                [fetchUser, 1], (err, rows) => {
                    if (err) {
                        return reject(err);
                    }
                    console.log("Insert new username success");
                    return resolve(rows)
                })
            })
            return resolved;
        })
        .then(body => {
            console.log("Recording snapshot for", fetchUser);
            var rows = stats.split("\n");

            for (let i = 0; i < 25; i++) {
                var row = rows[i].split(",");
                infoArr.push([row[1], row[2]]);
            }

            return dbOperations.recordSnapshot(fetchUser, infoArr);
        })
        .then(rows => {
            console.log("Sending success response");
            res.status(200).send('200');
        })
        .catch(err => {
            console.log(err.message);
            res.status(404).send(err.message);
        }); 
})

app.get("/users/delete", [auth, admin], (req, res) => {
    var fetchUser = req.query.username;
    var [monthStart, nextMonthStart] = dbOperations.currentMonthBounds();
    console.log("Deleting user", fetchUser);

    if (fetchUser === undefined) {
        res.status(404).send("Undefined user");
        return;
    }
    var query = new Promise((resolve, reject) => {
        db.all(`DELETE FROM users WHERE username = ?;`,
        [fetchUser], (err, rows) => {
            if (err) {
                console.log("User delete error");
                return reject(new Error("User delete error"));
            };
            return resolve(fetchUser)
        });
    })
    .then(success => {
        var query = new Promise((resolve, reject) => {
            db.all(`DELETE FROM snapshotdata WHERE (
                username = ? AND
                capturedAt >= ? AND
                capturedAt < ?);`,
            [fetchUser, monthStart, nextMonthStart], (err, rows) => {
                if (err) {
                    console.log("User snapshotdata delete error");
                    return reject(err);
                };
                return resolve(fetchUser)
            });
        })
        return query;
    })
    .then(rows => {
        console.log("sending response");
        res.status(200).send('200')
    })
    .catch(err => {
        console.log(err.message)
        res.status(404).send(err.message);
    });
});

app.get("/users/update", [auth, admin], (req, res) => {
    var fetchUser = req.query.username;
    var active = req.query.active;
    console.log("update", fetchUser, active);
    if (fetchUser === undefined || active === undefined) {
        res.status(404).send("Undefined user or status");
        return;
    }
    dbOperations.disableUser(active, fetchUser, res);
});

// Get all users
app.get("/allusers", [auth, admin], (req, res) => {
    dbOperations.getAllUsers(res);
})

// Get main feed
app.get("/users", (req, res) => {
    dbOperations.getMainFeed(res);
})

// Shared by both crons below (the 30-min "end" refresh and the
// start-of-month capture): fetches each user's current hiscores and
// records one snapshotdata row via dbOperations.recordSnapshot, instead
// of each cron running its own table-specific UPDATE/INSERT SQL.
//
// On a Jagex 404, disables the user — previously only the start-of-month
// path did this and the 30-min cron merely logged the error; this is a
// deliberate behavior change so both crons disable a user consistently
// once their username is no longer found on the hiscores.
const captureSnapshot = async (users) => {
    for (let i = 0; i < users.length; i++) {
        var username = users[i].username;

        await fetch(`https://secure.runescape.com/m=hiscore_oldschool/index_lite.ws?player=${username}`, {method: 'GET', headers: {}})
        .then(res => {
            if (!res.ok) {
                console.log("Username not found in jagex API, disabling user", username);
                dbOperations.disableUser(0, username);
                throw new Error("Username not found in jagex API");
            }
            return res.text()
        })
        .then(res => {
            var rows = res.split("\n");
            var infoArr = [];

            for (let i = 0; i < 25; i++) {
                var row = rows[i].split(",");
                infoArr.push([row[1], row[2]]);
            }
            console.log("Recording snapshot for", username);
            return dbOperations.recordSnapshot(username, infoArr);
        })
        .catch(err => console.log(err.message));
    };
}

/*
 Update database every 30 minutes
 */
cron.schedule('3,33 * * * *', () => {
    console.log('running a task every 3 past AND 27 to');

    var query = new Promise((resolve, reject) => {
        db.all(`SELECT * FROM users;`, [], (err, rows) => {
            if (err) {
                return reject(err);
            }
            return resolve(rows);
        });
    })
    .then(users=> {
        captureSnapshot(users);
    })
    .catch(err => console.log(err.message));
});

/*
 Update database at the start of the month
 */
cron.schedule('0 0 1 * *', () => {
    console.log('Start of the month db update');

    var query = new Promise((resolve, reject) => {
        db.all(`SELECT * FROM users;`, [], (err, rows) => {
            if (err) {
                return reject(err);
            }
            return resolve(rows);
        });
    })
    .then(users=> {
        captureSnapshot(users);
    })
    .catch(err => console.log(err.message));
});

// Parse JSON bodies (as sent by API clients)
app.use(express.json());

app.post("/login", (req, res) => {
    var username = req.body.username;
    var password = req.body.password;
    console.log("login", username, password);

    var query = new Promise((resolve, reject) => {
        db.all(`SELECT * FROM admins WHERE username = ?;`, [username], (err, rows) => {
            if (err) {
                console.log(err);
                return reject(err);
            }
            console.log(rows);
            return resolve(rows);
        });
    })
    .then(rows => {
        if (rows.length < 1) {
            console.log("no match");
            throw new Error("Unauthorized!");
        }
        bcrypt.compare(password, rows[0]["password"], function(err, compRes){
            if (compRes) {
                const token = jwt.sign({
                    username: username,
                    roles: ["admin"],
                }, process.env.JWTPRIVATEKEY, { expiresIn: "15m" }); 

                res.status(200).send({ok: true, token: token});
            } else {
                res.status(404).send("Unauthorized");
            }
        })
    })
    .catch(err => res.status(404).send(JSON.stringify(err.message)));
    
});

app.listen(5000, () => console.log("Dataserver started on port 5000"))