const express = require('express');
const router = express.Router();

const ds = require('../datastore');
const datastore = ds.datastore;
var jwtDecode = require('jwt-decode');
const getId = ds.getId;
const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');
router.use(express.json());

const USER = 'user';

//jwt token middleware
const checkJwt = jwt({
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
  }),
  issuer: 'https://accounts.google.com',
  algorithms: ['RS256'],
});
const handleError = function (err, req, res, next) {
  if (err.name === 'UnauthorizedError') {
    req.error = 'Invalid Token';
    next();
  }
};

const getUser = async (id) => {
  const query = datastore.createQuery(USER).filter('user_id', '=', id);
  const queryResult = await datastore.runQuery(query);
  const user = queryResult[0][0];
  if (user) {
    return user;
  } else {
    err = {
      status: 404,
      error: 'User not found',
    };
    throw err;
  }
};

/************************************ ENDPOINTS ********************************************/

router.get('/', async (req, res, err) => {
  try {
    const query = datastore.createQuery(USER);
    const queryResult = await datastore.runQuery(query);
    const users = queryResult[0];
    res.set('Content-Type', 'application/json');
    res.status(200).json(users);
  } catch (err) {
    return res.status(err.status).send(err.error);
  }
});

router.get('/:user_id', checkJwt, handleError, async (req, res, err) => {
  try {
    if (req.error === 'Invalid Token') {
      throw { status: 401, error: 'Invalid Token' };
    } else {
      const sub = jwtDecode(req.headers.authorization).sub;
      if (sub !== req.params.user_id) {
        const err = {
          status: 403,
          error: `Forbidden to access user`,
        };
        throw err;
      }
      const user = await getUser(sub);
      res.set('Content-Type', 'application/json');
      res.status(200).json(user);
    }
  } catch (err) {
    return res.status(err.status).send(err.error);
  }
});

module.exports = router;
