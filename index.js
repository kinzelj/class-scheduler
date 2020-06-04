require('dotenv').config();

const express = require('express');
const cookieSession = require('cookie-session')
// const cors = require('cors');
var fs = require('fs')
var https = require('https')
const app = express();
// app.use(cors());

var cookieSess = {
  maxAge: 24 * 60 * 60 * 1000, //session cookie valid for 1 day
  keys: [process.env.SESSION_SECRET]
};

app.use(cookieSession(cookieSess));

const oauth = require('./routes/oauth.js');
app.use('/oauth', oauth);

const users = require('./routes/users.js');
app.use('/users', users);

const schedules = require('./routes/schedules.js');
app.use('/schedules', schedules);

const classes = require('./routes/classes.js');
app.use('/classes', classes);

const root = require('path').join(__dirname, 'client', 'build')
app.use(express.static(root));
app.get("*", (req, res) => {
    res.sendFile('index.html', { root });
})

// Start https server
const HTTPS_PORT = 5000;
var credentials = {
  key: fs.readFileSync('./auth/domain.key'),
  cert: fs.readFileSync('./auth/domain.crt'),
};
https.createServer(credentials, app).listen(HTTPS_PORT, () => {
  console.log(`https server listening on port ${HTTPS_PORT}`);
});

// // Start the server
// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => {
//     console.log(`App listening on port ${PORT}`);
//     console.log('Press Ctrl+C to quit.');
// });


module.exports = app;