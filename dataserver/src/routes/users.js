const express = require("express")
const usersDb = require("../db/users.js");
const snapshots = require("../db/snapshots.js");
const hiscores = require("../hiscores.js");
const auth = require("../../middleware/auth");
const { admin } = require("../../middleware/roles");

const router = express.Router()

router.get("/users/add", [auth, admin], (req, res) => {
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

router.get("/users/delete", [auth, admin], (req, res) => {
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

router.get("/users/update", [auth, admin], (req, res) => {
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
router.get("/allusers", [auth, admin], (req, res) => {
    usersDb.getAllUsers()
        .then(result => res.status(200).send(JSON.stringify(result)))
        .catch(err => res.status(404).send(err.message));
})

// Get main feed
router.get("/users", (req, res) => {
    usersDb.getMainFeed()
        .then(resDict => res.status(200).send(JSON.stringify(resDict)))
        .catch(err => res.status(404).send(err.message));
})

module.exports = router
