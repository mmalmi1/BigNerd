const jwt = require("jsonwebtoken");
require('dotenv').config()

function admin(req, res, next) {
    const token = req.header("Authorization");
    const decoded = jwt.verify(token, process.env.JWTPRIVATEKEY);

    if (!decoded.roles.includes("admin")) return res.status(403).send({
        ok: false,
        error: "Access denied."
    });

    next();
}

module.exports = { admin };