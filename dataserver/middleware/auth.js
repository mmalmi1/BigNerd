const jwt = require("jsonwebtoken");
require('dotenv').config()

module.exports = (req, res, next) => {
    const token = req.header("Authorization");

    if (!token) return res.status(401).send({
        ok: false,
        error: "Access denied. No token provided"
    });

    try {
        const decoded = jwt.verify(token, process.env.JWTPRIVATEKEY);
    } catch (error) {
        return res.status(401).send({
            ok: false,
            error: "Token expired"
        });
    }

    next();
}