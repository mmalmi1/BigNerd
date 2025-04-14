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
    var date = new Date();
    var day = date.getDate();
    var month = date.getMonth() + 1;
    var year = date.getFullYear();
    var primaryKey = [fetchUser, day, month, year].join("_");

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
            console.log("Inserting data to startdata table");
            var rows = stats.split("\n");

            for (let i = 0; i < 25; i++) {
                var row = rows[i].split(",");
                infoArr.push([row[1], row[2]]);
            }

            var insert_startdata = new Promise((resolve, reject) => {
                db.all(`INSERT INTO startdata (
                    id,
                    username,
                    startDay,
                    startMonth,
                    startYear,
                    overallLvl,
                    overallExp,
                    attackLvl,
                    attackExp,
                    defenceLvl,
                    defenceExp,
                    strengthLvl,
                    strengthExp,
                    hitpointsLvl,
                    hitpointsExp,
                    rangedLvl,
                    rangedExp,
                    prayerLvl,
                    prayerExp,
                    magicLvl,
                    magicExp,
                    cookingLvl,
                    cookingExp,
                    woodcuttingLvl,
                    woodcuttingExp,
                    fletchingLvl,
                    fletchingExp,
                    fishingLvl,
                    fishingExp,
                    firemakingLvl,
                    firemakingExp,
                    craftingLvl,
                    craftingExp,
                    smithingLvl,
                    smithingExp,
                    miningLvl,
                    miningExp,
                    herbloreLvl,
                    herbloreExp,
                    agilityLvl,
                    agilityExp,
                    thievingLvl,
                    thievingExp,
                    slayerLvl,
                    slayerExp,
                    farmingLvl,
                    farmingExp,
                    runecraftingLvl,
                    runecraftingExp,
                    hunterLvl,
                    hunterExp,
                    constructionLvl,
                    constructionExp
                    ) VALUES (
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?
                    );`,
                [primaryKey,
                fetchUser,
                day,
                month,
                year,
                infoArr[0][0], infoArr[0][1],
                infoArr[1][0], infoArr[1][1],
                infoArr[2][0], infoArr[2][1],
                infoArr[3][0], infoArr[3][1],
                infoArr[4][0], infoArr[4][1],
                infoArr[5][0], infoArr[5][1],
                infoArr[6][0], infoArr[6][1],
                infoArr[7][0], infoArr[7][1],
                infoArr[8][0], infoArr[8][1],
                infoArr[9][0], infoArr[9][1],
                infoArr[10][0], infoArr[10][1],
                infoArr[11][0], infoArr[11][1],
                infoArr[12][0], infoArr[12][1],
                infoArr[13][0], infoArr[13][1],
                infoArr[14][0], infoArr[14][1],
                infoArr[15][0], infoArr[15][1],
                infoArr[16][0], infoArr[16][1],
                infoArr[17][0], infoArr[17][1],
                infoArr[18][0], infoArr[18][1],
                infoArr[19][0], infoArr[19][1],
                infoArr[20][0], infoArr[20][1],
                infoArr[21][0], infoArr[21][1],
                infoArr[22][0], infoArr[22][1],
                infoArr[23][0], infoArr[23][1],
                ], (err, rows) => {
                    if (err) {
                        return reject(err);
                    }
                    console.log("Insert start data success");
                    return resolve(rows);
                })
            })
        })
        .then(body => {
            console.log("Inserting data to enddata table");

            var insert_enddata = new Promise((resolve, reject) => {
                db.all(`INSERT INTO enddata (
                    id,
                    username,
                    endDay,
                    endMonth,
                    endYear,
                    overallLvl,
                    overallExp,
                    attackLvl,
                    attackExp,
                    defenceLvl,
                    defenceExp,
                    strengthLvl,
                    strengthExp,
                    hitpointsLvl,
                    hitpointsExp,
                    rangedLvl,
                    rangedExp,
                    prayerLvl,
                    prayerExp,
                    magicLvl,
                    magicExp,
                    cookingLvl,
                    cookingExp,
                    woodcuttingLvl,
                    woodcuttingExp,
                    fletchingLvl,
                    fletchingExp,
                    fishingLvl,
                    fishingExp,
                    firemakingLvl,
                    firemakingExp,
                    craftingLvl,
                    craftingExp,
                    smithingLvl,
                    smithingExp,
                    miningLvl,
                    miningExp,
                    herbloreLvl,
                    herbloreExp,
                    agilityLvl,
                    agilityExp,
                    thievingLvl,
                    thievingExp,
                    slayerLvl,
                    slayerExp,
                    farmingLvl,
                    farmingExp,
                    runecraftingLvl,
                    runecraftingExp,
                    hunterLvl,
                    hunterExp,
                    constructionLvl,
                    constructionExp
                    ) VALUES (
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?
                    );`,
                [primaryKey,
                fetchUser,
                day,
                month,
                year,
                infoArr[0][0], infoArr[0][1],
                infoArr[1][0], infoArr[1][1],
                infoArr[2][0], infoArr[2][1],
                infoArr[3][0], infoArr[3][1],
                infoArr[4][0], infoArr[4][1],
                infoArr[5][0], infoArr[5][1],
                infoArr[6][0], infoArr[6][1],
                infoArr[7][0], infoArr[7][1],
                infoArr[8][0], infoArr[8][1],
                infoArr[9][0], infoArr[9][1],
                infoArr[10][0], infoArr[10][1],
                infoArr[11][0], infoArr[11][1],
                infoArr[12][0], infoArr[12][1],
                infoArr[13][0], infoArr[13][1],
                infoArr[14][0], infoArr[14][1],
                infoArr[15][0], infoArr[15][1],
                infoArr[16][0], infoArr[16][1],
                infoArr[17][0], infoArr[17][1],
                infoArr[18][0], infoArr[18][1],
                infoArr[19][0], infoArr[19][1],
                infoArr[20][0], infoArr[20][1],
                infoArr[21][0], infoArr[21][1],
                infoArr[22][0], infoArr[22][1],
                infoArr[23][0], infoArr[23][1],
                ], (err, rows) => {
                    if (err) {
                        return reject(err);
                    }
                    console.log("Insert end data success");
                    return resolve(rows);
                })
            })
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
    var date = new Date();
    var month = date.getMonth() + 1;
    var year = date.getFullYear();
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
            db.all(`DELETE FROM startdata WHERE (
                username = ? AND 
                startMonth = ? AND
                startYear = ?);`,
            [fetchUser, month, year], (err, rows) => {
                if (err) {
                    console.log("User startdata delete error");
                    return reject(err);
                };
                return resolve(fetchUser)
            });
        })     
    })
    .then(success => {
        var query = new Promise((resolve, reject) => {
            db.all(`DELETE FROM enddata WHERE (
                username = ? AND 
                endMonth = ? AND
                endYear = ?);`,
            [fetchUser, month, year], (err, rows) => {
                if (err) {
                    console.log("User enddata delete error");
                    return reject(err);
                };
                return resolve(fetchUser)
            });
        })     
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

const updateEndData = async(users) => {
    var date = new Date();
    var month = date.getMonth() + 1;
    var year = date.getFullYear();

    for (let i = 0; i < users.length; i++) {
        var username = users[i].username;    
        await fetch(`https://secure.runescape.com/m=hiscore_oldschool/index_lite.ws?player=${username}`, {method: 'GET', headers: {}})
        .then(res => {
            if (!res.ok) {
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
            console.log(username, infoArr[0][0]);

            var update_enddata = new Promise((resolve, reject) => {
                db.all(`UPDATE enddata SET 
                    overallLvl = ?,
                    overallExp = ?,
                    attackLvl = ?,
                    attackExp = ?,
                    defenceLvl = ?,
                    defenceExp = ?,
                    strengthLvl = ?,
                    strengthExp = ?,
                    hitpointsLvl = ?,
                    hitpointsExp = ?,
                    rangedLvl = ?,
                    rangedExp = ?,
                    prayerLvl = ?,
                    prayerExp = ?,
                    magicLvl = ?,
                    magicExp = ?,
                    cookingLvl = ?,
                    cookingExp = ?,
                    woodcuttingLvl = ?,
                    woodcuttingExp = ?,
                    fletchingLvl = ?,
                    fletchingExp = ?,
                    fishingLvl = ?,
                    fishingExp = ?,
                    firemakingLvl = ?,
                    firemakingExp = ?,
                    craftingLvl = ?,
                    craftingExp = ?,
                    smithingLvl = ?,
                    smithingExp = ?,
                    miningLvl = ?,
                    miningExp = ?,
                    herbloreLvl = ?,
                    herbloreExp = ?,
                    agilityLvl = ?,
                    agilityExp = ?,
                    thievingLvl = ?,
                    thievingExp = ?,
                    slayerLvl = ?,
                    slayerExp = ?,
                    farmingLvl = ?,
                    farmingExp = ?,
                    runecraftingLvl = ?,
                    runecraftingExp = ?,
                    hunterLvl = ?,
                    hunterExp = ?,
                    constructionLvl = ?,
                    constructionExp = ?
                    WHERE (
                    username = ? AND
                    endMonth = ? AND
                    endYear = ? 
                    );`,
                [
                infoArr[0][0], infoArr[0][1],
                infoArr[1][0], infoArr[1][1],
                infoArr[2][0], infoArr[2][1],
                infoArr[3][0], infoArr[3][1],
                infoArr[4][0], infoArr[4][1],
                infoArr[5][0], infoArr[5][1],
                infoArr[6][0], infoArr[6][1],
                infoArr[7][0], infoArr[7][1],
                infoArr[8][0], infoArr[8][1],
                infoArr[9][0], infoArr[9][1],
                infoArr[10][0], infoArr[10][1],
                infoArr[11][0], infoArr[11][1],
                infoArr[12][0], infoArr[12][1],
                infoArr[13][0], infoArr[13][1],
                infoArr[14][0], infoArr[14][1],
                infoArr[15][0], infoArr[15][1],
                infoArr[16][0], infoArr[16][1],
                infoArr[17][0], infoArr[17][1],
                infoArr[18][0], infoArr[18][1],
                infoArr[19][0], infoArr[19][1],
                infoArr[20][0], infoArr[20][1],
                infoArr[21][0], infoArr[21][1],
                infoArr[22][0], infoArr[22][1],
                infoArr[23][0], infoArr[23][1],
                username,
                month,
                year
                ], (err, rows) => {
                    if (err) {
                        return reject(err);
                    }
                    console.log("Update end data success");
                    return resolve(rows);
                })
            })
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
        updateEndData(users);
    })
    .catch(err => console.log(err.message));
});

const insertStartMonthData = async(users) => {
    var date = new Date();
    var day = date.getDate();
    var month = date.getMonth() + 1;
    var year = date.getFullYear();

    for (let i = 0; i < users.length; i++) {
        var username = users[i].username;
        var primaryKey = [username, day, month, year].join("_");
        var infoArr = [];   

        await fetch(`https://secure.runescape.com/m=hiscore_oldschool/index_lite.ws?player=${username}`, {method: 'GET', headers: {}})
        .then(res => {
            if (!res.ok) {
                console.log("Username not found in jagex API, disabling user", primaryKey);
                dbOperations.disableUser(0, username, res);
                throw new Error("Username not found in jagex API");
            }
            return res.text()
        })
        .then(res => {
            var rows = res.split("\n");

            for (let i = 0; i < 25; i++) {
                var row = rows[i].split(",");
                infoArr.push([row[1], row[2]]);
            }
            console.log("Inserting data to startdata table", primaryKey);
            var insert_startdata = new Promise((resolve, reject) => {
                db.all(`INSERT INTO startdata (
                    id,
                    username,
                    startDay,
                    startMonth,
                    startYear,
                    overallLvl,
                    overallExp,
                    attackLvl,
                    attackExp,
                    defenceLvl,
                    defenceExp,
                    strengthLvl,
                    strengthExp,
                    hitpointsLvl,
                    hitpointsExp,
                    rangedLvl,
                    rangedExp,
                    prayerLvl,
                    prayerExp,
                    magicLvl,
                    magicExp,
                    cookingLvl,
                    cookingExp,
                    woodcuttingLvl,
                    woodcuttingExp,
                    fletchingLvl,
                    fletchingExp,
                    fishingLvl,
                    fishingExp,
                    firemakingLvl,
                    firemakingExp,
                    craftingLvl,
                    craftingExp,
                    smithingLvl,
                    smithingExp,
                    miningLvl,
                    miningExp,
                    herbloreLvl,
                    herbloreExp,
                    agilityLvl,
                    agilityExp,
                    thievingLvl,
                    thievingExp,
                    slayerLvl,
                    slayerExp,
                    farmingLvl,
                    farmingExp,
                    runecraftingLvl,
                    runecraftingExp,
                    hunterLvl,
                    hunterExp,
                    constructionLvl,
                    constructionExp
                    ) VALUES (
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?
                    );`,
                    [primaryKey,
                    username,
                    day,
                    month,
                    year,
                    infoArr[0][0], infoArr[0][1],
                    infoArr[1][0], infoArr[1][1],
                    infoArr[2][0], infoArr[2][1],
                    infoArr[3][0], infoArr[3][1],
                    infoArr[4][0], infoArr[4][1],
                    infoArr[5][0], infoArr[5][1],
                    infoArr[6][0], infoArr[6][1],
                    infoArr[7][0], infoArr[7][1],
                    infoArr[8][0], infoArr[8][1],
                    infoArr[9][0], infoArr[9][1],
                    infoArr[10][0], infoArr[10][1],
                    infoArr[11][0], infoArr[11][1],
                    infoArr[12][0], infoArr[12][1],
                    infoArr[13][0], infoArr[13][1],
                    infoArr[14][0], infoArr[14][1],
                    infoArr[15][0], infoArr[15][1],
                    infoArr[16][0], infoArr[16][1],
                    infoArr[17][0], infoArr[17][1],
                    infoArr[18][0], infoArr[18][1],
                    infoArr[19][0], infoArr[19][1],
                    infoArr[20][0], infoArr[20][1],
                    infoArr[21][0], infoArr[21][1],
                    infoArr[22][0], infoArr[22][1],
                    infoArr[23][0], infoArr[23][1],
                    ], (err, rows) => {
                    if (err) {
                        return reject(err);
                    }
                    console.log("Insert start data success");
                    return resolve(rows);
                })
            })
        })
        .then(body => {
            console.log("Inserting data to enddata table", primaryKey);
            var insert_enddata = new Promise((resolve, reject) => {
                db.all(`INSERT INTO enddata (
                    id,
                    username,
                    endDay,
                    endMonth,
                    endYear,
                    overallLvl,
                    overallExp,
                    attackLvl,
                    attackExp,
                    defenceLvl,
                    defenceExp,
                    strengthLvl,
                    strengthExp,
                    hitpointsLvl,
                    hitpointsExp,
                    rangedLvl,
                    rangedExp,
                    prayerLvl,
                    prayerExp,
                    magicLvl,
                    magicExp,
                    cookingLvl,
                    cookingExp,
                    woodcuttingLvl,
                    woodcuttingExp,
                    fletchingLvl,
                    fletchingExp,
                    fishingLvl,
                    fishingExp,
                    firemakingLvl,
                    firemakingExp,
                    craftingLvl,
                    craftingExp,
                    smithingLvl,
                    smithingExp,
                    miningLvl,
                    miningExp,
                    herbloreLvl,
                    herbloreExp,
                    agilityLvl,
                    agilityExp,
                    thievingLvl,
                    thievingExp,
                    slayerLvl,
                    slayerExp,
                    farmingLvl,
                    farmingExp,
                    runecraftingLvl,
                    runecraftingExp,
                    hunterLvl,
                    hunterExp,
                    constructionLvl,
                    constructionExp
                    ) VALUES (
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?
                    );`,
                    [primaryKey,
                    username,
                    day,
                    month,
                    year,
                    infoArr[0][0], infoArr[0][1],
                    infoArr[1][0], infoArr[1][1],
                    infoArr[2][0], infoArr[2][1],
                    infoArr[3][0], infoArr[3][1],
                    infoArr[4][0], infoArr[4][1],
                    infoArr[5][0], infoArr[5][1],
                    infoArr[6][0], infoArr[6][1],
                    infoArr[7][0], infoArr[7][1],
                    infoArr[8][0], infoArr[8][1],
                    infoArr[9][0], infoArr[9][1],
                    infoArr[10][0], infoArr[10][1],
                    infoArr[11][0], infoArr[11][1],
                    infoArr[12][0], infoArr[12][1],
                    infoArr[13][0], infoArr[13][1],
                    infoArr[14][0], infoArr[14][1],
                    infoArr[15][0], infoArr[15][1],
                    infoArr[16][0], infoArr[16][1],
                    infoArr[17][0], infoArr[17][1],
                    infoArr[18][0], infoArr[18][1],
                    infoArr[19][0], infoArr[19][1],
                    infoArr[20][0], infoArr[20][1],
                    infoArr[21][0], infoArr[21][1],
                    infoArr[22][0], infoArr[22][1],
                    infoArr[23][0], infoArr[23][1],
                    ], (err, rows) => {
                    if (err) {
                        return reject(err);
                    }
                    console.log("Insert end data success");
                    return resolve(rows);
                })
            })
        })
        .catch(err => console.log(err.message));
    };
}

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
        insertStartMonthData(users);
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