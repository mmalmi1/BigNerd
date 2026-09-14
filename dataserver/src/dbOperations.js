const db = require("./dbConn.js").db;

function disableUser(active, fetchUser, res) {
    const sendResponse = (status, payload) => {
        if (res && typeof res.status === 'function') {
            res.status(status).send(payload);
        }
    };

    db.get(`SELECT * FROM users WHERE username = ?`, [fetchUser], (err, row) => {
        if (err || row == undefined) {
            console.log("User not found");
            sendResponse(403, "Username not found");
            return;
        }

        db.run(`UPDATE users SET active = ? WHERE username = ?;`, [active, fetchUser], (err) => {
            if (err) {
                console.log("User update error");
                sendResponse(403, err.message);
                return;
            }

            console.log("User update success");
            sendResponse(200, '200');
        });
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
                    console.log("Get startdata error\n");
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
                    console.log("Get enddata error\n", err);
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