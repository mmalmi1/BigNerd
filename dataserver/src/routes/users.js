const express = require("express")
const usersDb = require("../db/users.js");
const snapshots = require("../db/snapshots.js");
const hiscores = require("../hiscores.js");
const auth = require("../../middleware/auth");
const { admin } = require("../../middleware/roles");

const router = express.Router()

function isValidYear(value) {
    return typeof value === "string" && value !== "" && /^\d+$/.test(value);
}

function isValidMonth(value) {
    if (value === "all") return true;
    if (typeof value !== "string" || value === "" || !/^\d+$/.test(value)) return false;
    var n = Number(value);
    return n >= 1 && n <= 12;
}

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
    var year = req.query.year;
    var month = req.query.month;
    if (!isValidYear(year) || !isValidMonth(month)) {
        res.status(400).send("year and month query params are required; month must be 1-12 or \"all\"");
        return;
    }
    usersDb.getMainFeed(Number(year), month === "all" ? "all" : Number(month))
        .then(resDict => res.status(200).send(JSON.stringify(resDict)))
        .catch(err => res.status(404).send(err.message));
})

// Get the years that have snapshot data for active users
router.get("/years", (req, res) => {
    snapshots.getAvailableYears()
        .then(years => res.status(200).send(JSON.stringify(years)))
        .catch(err => res.status(404).send(err.message));
})

// Get per-user time-series points for one skill/metric over a year/month range
router.get("/users/plot", (req, res) => {
    var year = req.query.year;
    var month = req.query.month;
    var skill = req.query.skill;
    var metric = req.query.metric;
    if (!isValidYear(year) || !isValidMonth(month)) {
        res.status(400).send("year and month query params are required; month must be 1-12 or \"all\"");
        return;
    }
    if (typeof skill !== "string" || !snapshots.SKILL_KEYS.includes(skill)) {
        res.status(400).send("skill query param must be one of: " + snapshots.SKILL_KEYS.join(", "));
        return;
    }
    if (metric !== "lvl" && metric !== "exp") {
        res.status(400).send("metric query param must be \"lvl\" or \"exp\"");
        return;
    }
    var column = `${skill}${metric === "lvl" ? "Lvl" : "Exp"}`;
    if (!snapshots.SKILL_COLUMNS.includes(column)) {
        res.status(400).send("invalid skill/metric combination");
        return;
    }
    snapshots.getSkillSeries(Number(year), month === "all" ? "all" : Number(month), column)
        .then(series => res.status(200).send(JSON.stringify({ column, series })))
        .catch(err => res.status(404).send(err.message));
});

module.exports = router
