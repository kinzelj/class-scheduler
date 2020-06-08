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
const CLASS = 'class';
const SCHEDULE = 'schedule';

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

const getClasses = async (cursor, limit) => {
  let classes;
  try {
    const query = datastore.createQuery(CLASS).limit(limit);
    if (cursor) {
      query.start(cursor);
    }
    classes = await datastore.runQuery(query);
  } catch (err) {
    throw { status: 400, error: err.note };
  }

  if (!classes[0]) {
    const err = {
      status: 404,
      error: `No classes found`,
    };
    throw err;
  }
  let results = {};
  results.classes = classes[0].map((item) => {
    return { ...item, id: getId(item) };
  });
  if (classes[1].moreResults !== datastore.NO_MORE_RESULTS) {
    results.next = classes[1].endCursor;
  }
  return results;
};

const getClass = async (id) => {
  const key = datastore.key([CLASS, parseInt(id, 10)]);
  if (isNaN(key.id)) {
    const err = {
      status: 406,
      error: `Invalid ID`,
    };
    throw err;
  }
  const return_class = await datastore.get(key);
  if (!return_class[0]) {
    const err = {
      status: 404,
      error: `No class with this id exists`,
    };
    throw err;
  }
  return return_class[0];
};

const validateDay = (data) => {
  let err = null;
  data.days_of_week.forEach((item, index) => {
    const validDays = ['M', 'Tu', 'W', 'Th', 'F', 'Sa', 'Su'];
    if (!validDays.includes(item)) {
      err = {
        status: 400,
        error:
          'Invalid day of the week. Use only "M", "Tu", "W", "Th", "F", "Sa", or "Su".',
      };
    }
  });
  return err;
};

const validateHour = (data) => {
  if (data.class_hour < 8 || data.class_hour > 22) {
    return {
      status: 400,
      error:
        'Invalid class time. Classes are only scheduled between hours 8 and 22 (8am through 10pm).',
    };
  } else return null;
};

const checkInputs = (data) => {
  if (
    !data.name ||
    !data.description ||
    !data.section ||
    !data.days_of_week ||
    !data.class_hour
  ) {
    return {
      status: 400,
      error:
        'The request body is missing at least one of the required attributes',
    };
  } else return null;
};

const createClass = async (data) => {
  //validate input
  let err = checkInputs(data);
  if (err) {
    throw err;
  }

  //validate days_of_week input
  err = validateDay(data);
  if (err) {
    throw err;
  }

  //validate class_hour input
  err = validateHour(data);
  if (err) {
    throw err;
  }

  //check to make sure class/section doesn't already exist
  const query = datastore
    .createQuery(CLASS)
    .filter('name', '=', data.name)
    .filter('section', '=', data.section);
  const queryResult = await datastore.runQuery(query);
  const existingClass = queryResult[0][0];

  //add new class if one doesn't already exist
  if (!existingClass) {
    try {
      const result = await datastore.save({
        key: datastore.key(CLASS),
        data: {
          name: data.name,
          description: data.description,
          section: data.section,
          days_of_week: data.days_of_week,
          class_hour: data.class_hour,
          schedules: [],
        },
      });
      const new_id = result[0].mutationResults[0].key.path[0].id;
      let newClass = await getClass(new_id);
      return newClass;
    } catch (err) {
      throw err;
    }
  } else {
    err = {
      status: 403,
      error: 'Class/section already exists',
    };
    throw err;
  }
};

const updateClass = async (class_id, data) => {
  try {
    let classEntity = await getClass(class_id);

    let err = null;

    //if user is trying to update schedules array, throw error
    if (data.schedules) {
      throw {status: 400, error: "Manually updating schedules is not allowed"}
    }

    //update name
    if (data.name) {
      classEntity.name = data.name;
    }

    //update section
    if (data.section) {
      classEntity.section = data.section;
    }

    //validate days_of_week input
    if (data.days_of_week) {
      err = validateDay(data);
      if (err) {
        throw err;
      } else {
        classEntity.days_of_week = data.days_of_week;
      }
    }

    //validate class_hour input
    if (data.class_hour) {
      err = validateHour(data);
      if (err) {
        throw err;
      } else {
        classEntity.class_hour = data.class_hour;
      }
    }

    //update description
    if (data.description) {
      classEntity.description = data.description;
    }

    //update class if one doesn't already exist
    let existingClass = null;
    if (data.name || data.section) {
      //check to make sure class/section doesn't already exist
      const query = datastore
        .createQuery(CLASS)
        .filter('name', '=', classEntity.name)
        .filter('section', '=', classEntity.section);
      const queryResult = await datastore.runQuery(query);
      existingClass = queryResult[0][0];
    }

    //update datastore
    if (!existingClass) {
      try {
        await datastore.save({
          key: (key = datastore.key([CLASS, parseInt(class_id, 10)])),
          data: classEntity,
        });
        let updatedClass = await getClass(class_id);
        return updatedClass;
      } catch (err) {
        throw err;
      }
    } else {
      err = {
        status: 403,
        error: 'Class/section already exists',
      };
      throw err;
    }
  } catch (err) {
    console.log(err);
    throw err;
  }
};

const getAllSchedules = async () => {
  try {
    const query = datastore.createQuery(SCHEDULE);
    const schedules = await datastore.runQuery(query);
    return schedules;
  } catch (err) {
    throw { status: 400, error: err.note };
  }
};

const deleteClass = async (class_id) => {
  //confirm class exists, 404 will be thrown if not
  await getClass(class_id);
  
  //remove class from all schedules
  const scheduleEntities = await getAllSchedules();
  const schedules = scheduleEntities[0];

  for (const schedule of schedules) {
    const class_index = schedule.classes.indexOf(class_id);
    if (class_index > -1) {
      schedule.classes.splice(class_index, 1);

      //update datastore
      const schedule_id = schedule[datastore.KEY].id;

      try {
        await datastore.update({
          key: (key = datastore.key([SCHEDULE, parseInt(schedule_id, 10)])),
          data: schedule,
        });
      } catch (err) {
        console.log(err);
        throw err;
      }
    }
  }

  //delete class
  const class_key = datastore.key([CLASS, parseInt(class_id, 10)]);
  await datastore.delete(class_key);
  return;
};

/************************************ ENDPOINTS ********************************************/

router.post('/', checkJwt, handleError, async (req, res, err) => {
  try {
    if (req.error === 'Invalid Token') {
      throw { status: 401, error: 'Invalid Token' };
    } else {
      let newClass = await createClass(req.body);
      newClass.id = getId(newClass);
      newClass.self = `${req.protocol}://${req.get('host')}${req.baseUrl}/${
        newClass.id
      }`;
      res.set('Content-Type', 'application/json');
      res.status(201).json(newClass);
    }
  } catch (err) {
    return res.status(err.status).send(err.error);
  }
});

router.get('/', async (req, res, err) => {
  try {
    let cursor = null;
    if (Object.keys(req.query).includes('cursor')) {
      cursor = req._parsedUrl.path.slice(9);
    }
    let results = await getClasses(cursor, 5);
    results.classes = results.classes.map((item) => {
      return {
        ...item,
        self: `${req.protocol}://${req.get('host')}${req.baseUrl}/${item.id}`,
      };
    });
    if (results.next) {
      results.next = `${req.protocol}://${req.get('host')}${
        req.baseUrl
      }?cursor=${results.next}`;
    }
    res.status(200).json(results);
  } catch (err) {
    return res.status(err.status).send(err.error);
  }
});

router.get('/:id', async (req, res, err) => {
  try {
    const returnClass = await getClass(req.params.id);
    returnClass.id = req.params.id;
    returnClass.self = `${req.protocol}://${req.get('host')}${req.baseUrl}/${
      req.params.id
    }`;
    res.set('Content-Type', 'application/json');
    res.status(200).json(returnClass);
  } catch (err) {
    return res.status(err.status).send(err.error);
  }
});

router.patch('/:id', checkJwt, handleError, async (req, res, err) => {
  try {
    if (req.error === 'Invalid Token') {
      throw { status: 401, error: 'Invalid Token' };
    } else {
      let updatedClass = await updateClass(req.params.id, req.body);
      updatedClass.id = getId(updatedClass);
      updatedClass.self = `${req.protocol}://${req.get('host')}${req.baseUrl}/${
        updatedClass.id
      }`;
      res.set('Content-Type', 'application/json');
      res.status(200).json(updatedClass);
    }
  } catch (err) {
    return res.status(err.status).send(err.error);
  }
});

router.delete('/:id', checkJwt, handleError, async (req, res, err) => {
  try {
    if (req.error === 'Invalid Token') {
      throw { status: 401, error: 'Invalid Token' };
    } else {
      await deleteClass(req.params.id);
      res.sendStatus(204);
    }
  } catch (err) {
    console.log(err);
    return res.status(err.status).send(err.error);
  }
});

module.exports = router;
