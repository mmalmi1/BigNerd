const express = require("express")
const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken");
const db = require("../dbConn.js").db;

const router = express.Router()

// Parse JSON bodies (as sent by API clients)
router.use(express.json());

router.post("/login", (req, res) => {
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

module.exports = router
