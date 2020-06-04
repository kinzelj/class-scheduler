const express = require('express');
const router = express.Router();

const ds = require('../datastore');
var jwtDecode = require('jwt-decode');
const datastore = ds.datastore;
const getId = ds.getId;
const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');
router.use(express.json());

//define kinds
const BOAT = 'boat';

//jwt token middleware
const checkJwt = jwt({
    secret: jwksRsa.expressJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: 'https://www.googleapis.com/oauth2/v3/certs'
    }),
    // getToken: getTokenFromKey = (req) => {
    //     let token_key = "";
    //     if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
    //         token_key = req.headers.authorization.split(' ')[1];
    //     }
    //     // else if (req.query && req.query.token) {
    //     //     token_key = req.query.token;
    //     // }
    //     else { return undefined }

    //     const TOKENS = req.app.get('TOKENS');
    //     const jwt = TOKENS[token_key];
    //     return jwt;
    // },
    // Validate the audience and the issuer.
    issuer: 'https://accounts.google.com',
    algorithms: ['RS256']
});
const handleError = function (err, req, res, next) {
    if (err.name === 'UnauthorizedError') {
        // res.status(401).send('Invalid Token');
        req.error = "Invalid Token";
        next();
    }
};

const createNewBoat = async (data) => {
    //input validation
    let err = null;
    if (!data.name || !data.type || !data.length) {
        err = {
            status: 400,
            error: "The request body is missing at least one of the required attributes"
        };
    }
    if (err) { throw (err) }

    try {
        const boatData = { owner: data.owner, name: data.name, type: data.type, length: data.length }
        const boat = await datastore.save({
            key: datastore.key(BOAT),
            data: boatData,
        });
        return boat;
    }
    catch (err) { throw (err) }
}

//get boat from boat id
const getBoat = async (id) => {
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    if (isNaN(key.id)) {
        const err = {
            status: 406,
            error: `Invalid ID`,
        }
        throw (err);
    }
    const boat = await datastore.get(key);
    if (!boat[0]) {
        const err = {
            status: 403,
            error: `No boat with this id exists`,
        };
        throw (err);
    }
    return boat[0];
}

/************************************ ROUTES ********************************************/
router.post('/', checkJwt, handleError, async (req, res, next) => {
    try {
        if (req.error === "Invalid Token") {
            throw ({ status: 401, error: "Invalid Token" })
        }
        const sub = jwtDecode(req.headers.authorization).sub;
        let data = req.body;
        data.owner = sub;
        const newBoat = await createNewBoat(req.body);
        const new_id = newBoat[0].mutationResults[0].key.path[0].id;
        let boat = await getBoat(new_id);
        boat.id = getId(boat);
        boat.self = `${req.protocol}://${req.get('host')}${req.baseUrl}/${new_id}`;
        res.set('Content-Type', 'application/json');
        res.status(201).json(boat);

    } catch (err) { console.log("ERR: " + err); return res.status(err.status).json(err.error) }
})

router.get('/', async (req, res, next) => {
    const query = datastore.createQuery(BOAT)
    const data = await datastore.runQuery(query);
    boat_data = data[0];
    boats = boat_data.map((boat)=> {
        boat_id = getId(boat);
        return {...boat, id: boat_id, self: `${req.protocol}://${req.get('host')}${req.baseUrl}/${boat_id}`};
    })
    const results = { boats: boats };
    res.set('Content-Type', 'application/json');
    res.status(200).json(results);
})

//delete boat with specified id 
router.delete('/:id', checkJwt, handleError, async (req, res, next) => {
    try {
        if (req.error === "Invalid Token") {
            throw ({ status: 401, error: "Invalid Token" })
        }
        //test if boat exists in database
        const boat = await getBoat(req.params.id);
        const sub = jwtDecode(req.headers.authorization).sub;

        //delete boat if correct owner
        if (boat.owner === sub) {
            const key = datastore.key([BOAT, parseInt(req.params.id, 10)]);
            await datastore.delete(key);
            res.sendStatus(204);
        }
        else {
            throw ({ status: 403, error: "User unauthorized to delete boat" })
        }
    } catch (err) { return res.status(err.status).json(err.error) }
})

module.exports = router;