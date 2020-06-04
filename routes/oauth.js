require('dotenv').config();
const express = require('express');
const router = express.Router();
const request = require('request');
const ds = require('../datastore');
const datastore = ds.datastore;
var jwtDecode = require('jwt-decode');
router.use(express.json());

const USER = 'user';

const createNewUser = async (user_id, email, given_name, family_name) => {
  try {
    const user = await datastore.save({
      key: datastore.key(USER),
      data: { 
        user_id: user_id,
        email: email,
        fname: given_name,
        lname: family_name,
       },
    });
    return user;
  } catch (err) {
    throw err;
  }
};

//random string function
//source: https://stackoverflow.com/a/10727155
function randomString(length) {
  chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var result = '';
  for (var i = length; i > 0; --i)
    result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

router.get('/login', async (req, res) => {
  try {
    var oauth2Endpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
    const stateString = randomString(64);
    req.session.state = stateString;

    var params = {
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT,
      response_type: 'code',
      scope: 'email profile',
      state: stateString,
    };

    const uri = `${oauth2Endpoint}?response_type=${params.response_type}&client_id=${params.client_id}&redirect_uri=${params.redirect_uri}&scope=${params.scope}&state=${params.state}`;
    res.json({ redirect: uri });
  } catch (err) {
    return res.status(err.status).send({ Error: err.error });
  }
});

router.get('/callback', async (req, res, next) => {
  try {
    if (req.query.state !== req.session.state) {
      res.sendStatus(400);
    } else {
      const requestCode = req.query.code;
      const clientID = process.env.GOOGLE_OAUTH_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      try {
        request.post(
          {
            url: `https://oauth2.googleapis.com/token`,
            form: {
              code: requestCode,
              grant_type: 'authorization_code',
              client_id: clientID,
              client_secret: clientSecret,
              redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT,
            },
          },
          async (err, response, body) => {
            const jwt = JSON.parse(body).id_token;
            const { sub, email, given_name, family_name } = jwtDecode(jwt);

            //determine if user exists in database
            const query = datastore.createQuery(USER).filter('user_id', '=', sub);
            const queryResult = await datastore.runQuery(query);
            const user = queryResult[0][0];

            //add new user if user with user_id does not exist in database
            if (!user) {
              const newUser = await createNewUser(sub, email, given_name, family_name);
              console.log(newUser);
            }
            res.redirect(`https://localhost:3000/info?token=${jwt}`);
          }
        );
      } catch (err) {
        throw { status: 400, error: err.response.data.error };
      }
    }
  } catch (err) {
    return res.status(err.status).send(err.error);
  }
});

module.exports = router;
