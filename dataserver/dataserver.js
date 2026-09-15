const express = require("express")

require('dotenv').config()
console.log(`${process.env.JWTPRIVATEKEY}`);
//bcrypt.hash("pass", 10).then(hash => console.log(hash));

const usersRouter = require("./src/routes/users.js");
const authRouter = require("./src/routes/auth.js");
const { scheduleSnapshotCronJobs } = require("./src/jobs/snapshotCapture.js");

const app = express()

app.use(usersRouter)
app.use(authRouter)

scheduleSnapshotCronJobs()

app.listen(5000, () => console.log("Dataserver started on port 5000"))
