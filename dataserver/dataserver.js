const express = require("express")
const bcrypt = require("bcrypt")
const cron = require('node-cron');
const jwt = require("jsonwebtoken");
const usersDb = require("./src/db/users.js");
const snapshots = require("./src/db/snapshots.js");
const hiscores = require("./src/hiscores.js");

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

    if (fetchUser === undefined) {
        res.status(404).send("Undefined user");
        return;
    }
    hiscores.fetchHiscore(fetchUser)
        .then(body => {
            stats = body;
            console.log("Inserting user", fetchUser);
            return usersDb.addUser(fetchUser, 1);
        })
        .then(resolved => {
            console.log("Recording snapshot for", fetchUser);
            var infoArr = hiscores.parseHiscoreRows(stats);

            return snapshots.recordSnapshot(fetchUser, infoArr);
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
    var [monthStart, nextMonthStart] = snapshots.currentMonthBounds();
    console.log("Deleting user", fetchUser);

    if (fetchUser === undefined) {
        res.status(404).send("Undefined user");
        return;
    }
    usersDb.deleteUser(fetchUser)
    .then(success => {
        return snapshots.deleteSnapshotsForUserInRange(fetchUser, monthStart, nextMonthStart);
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
    usersDb.disableUser(active, fetchUser)
        .then(() => res.status(200).send('200'))
        .catch(err => res.status(403).send(err.message));
});

// Get all users
app.get("/allusers", [auth, admin], (req, res) => {
    usersDb.getAllUsers()
        .then(result => res.status(200).send(JSON.stringify(result)))
        .catch(err => res.status(404).send(err.message));
})

// Get main feed
app.get("/users", (req, res) => {
    usersDb.getMainFeed()
        .then(resDict => res.status(200).send(JSON.stringify(resDict)))
        .catch(err => res.status(404).send(err.message));
})

// Shared by both crons below (the 30-min "end" refresh and the
// start-of-month capture): fetches each user's current hiscores and
// records one snapshotdata row via snapshots.recordSnapshot, instead
// of each cron running its own table-specific UPDATE/INSERT SQL.
//
// On a Jagex 404, disables the user — previously only the start-of-month
// path did this and the 30-min cron merely logged the error; this is a
// deliberate behavior change so both crons disable a user consistently
// once their username is no longer found on the hiscores.
const captureSnapshot = async (users) => {
    for (let i = 0; i < users.length; i++) {
        var username = users[i].username;

        await hiscores.fetchHiscore(username)
        .then(text => {
            var infoArr = hiscores.parseHiscoreRows(text);
            console.log("Recording snapshot for", username);
            return snapshots.recordSnapshot(username, infoArr);
        })
        .catch(err => {
            if (err.message === "Username not found in jagex API") {
                console.log("Username not found in jagex API, disabling user", username);
                usersDb.disableUser(0, username).catch(err => console.log(err.message));
            }
            console.log(err.message);
        });
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