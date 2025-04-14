const db = require("./dbConn.js").db;

function disableUser(active, fetchUser, res) {
    var pre_query = new Promise((resolve, reject) => {
        db.get(`SELECT * FROM users WHERE username = ?`, [fetchUser], (err, row) => {
            if (row == undefined || err) {
                console.log("User not found");
                return reject(new Error("Username not found"));
            };
            return resolve(row);
        })
    })
    .then(result=> {
        var query = new Promise((resolve, reject) => {
            db.all(`UPDATE users SET active = ? WHERE username = ?;`, [active, fetchUser], (err, rows) => {
                if (err) {
                    console.log("User update error");
                    return reject(err);
                };
                return resolve(fetchUser)
            });
        })
    })
    .then(result=> {
        console.log("User update success");
        res.status(200).send('200');
    })
    .catch(err => {
        console.log("User update failure");
        res.status(403).send(err.message);
        return;
    });
}
exports.disableUser = disableUser;

function sortFunction(a, b) {
    var x = a[2]["overallExp"] - a[1]["overallExp"]; 
    var y = b[2]["overallExp"] - b[1]["overallExp"]; 
    if (x === y) {
        return 0;
    }
    else {
        return (x > y) ? -1 : 1;
    }
}

function getMainFeed(res) {
    var date = new Date();
    var month = date.getMonth() + 1;
    var year = date.getFullYear();
    var params = [];
    var start = null;

    var query = new Promise((resolve, reject) => {
        db.all(`SELECT * FROM users WHERE active = 1;`, [], (err, rows) => {
            if (err) {
                return reject(err);
            }
            return resolve(rows);
        });
    })
    .then(success => {
        for (let i = 0; i < success.length; i++) {
            var row = success[i];
            params.push(row.username);       
        };
        params.push(year);
        params.push(month);

        var startData = new Promise((resolve, reject) => {
            db.all(`SELECT * FROM startdata WHERE (
                username IN (${ success.map(() => "?").join(",") }) AND
                startYear = ? AND
                startMonth = ?
            );`,
            params, (err, rows) => {
                if (err) {
                    console.log("Get startdata error");
                    return reject(err);
                };
                return resolve(rows);
            }); 
        })
        return startData;
    })
    .then(startData => {
        console.log(startData);
        var endData = new Promise((resolve, reject) => {
            db.all(`SELECT * FROM enddata WHERE (
                username IN (${ startData.map(() => "?").join(",") }) AND
                endYear = ? AND
                endMonth = ?
            );`,
            params, (err, rows) => {
                if (err) {
                    console.log("Get enddata error", err);
                    return reject(err);
                };
                return resolve(rows);
            }); 
        })
        start = startData;
        return endData;
    })
    .then(result=> {
        console.log("Users query success");
        resDict = [];
        for (let i = 0; i < result.length; i++) {
            var username = result[i]["username"];
            resDict.push([username, start[i], result[i]]);
        }
        resDict.sort(sortFunction);
        res.status(200).send(JSON.stringify(resDict));
    })
    .catch(err => res.status(404).send(err.message));
}
exports.getMainFeed = getMainFeed;

function getAllUsers(res) {
    var query = new Promise((resolve, reject) => {
        db.all(`SELECT * FROM users;`, [], (err, rows) => {
            if (err) {
                return reject(err);
            }
            return resolve(rows);
        });
    })
    .then(result=> {
        console.log("All users query success");
        res.status(200).send(JSON.stringify(result));
    })
    .catch(err => res.status(404).send(err.message));
}
exports.getAllUsers = getAllUsers;