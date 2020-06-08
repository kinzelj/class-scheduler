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
const SCHEDULE = 'schedule';
const CLASS = 'class';

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

const getSchedules = async (sub, cursor, limit) => {
  let schedules;
  try {
    const query = datastore
      .createQuery(SCHEDULE)
      .filter('owner', '=', sub)
      .limit(limit);
    if (cursor) {
      query.start(cursor);
    }
    schedules = await datastore.runQuery(query);
  } catch (err) {
    throw { status: 400, error: err.note };
  }

  if (!schedules[0]) {
    const err = {
      status: 404,
      error: `No schedules found`,
    };
    throw err;
  }
  let results = {};
  results.schedules = schedules[0].map((item) => {
    return { ...item, id: getId(item) };
  });
  if (schedules[1].moreResults !== datastore.NO_MORE_RESULTS) {
    results.next = schedules[1].endCursor;
  }
  return results;
};

const getSchedule = async (owner, id) => {
  const key = datastore.key([SCHEDULE, parseInt(id, 10)]);
  if (isNaN(key.id)) {
    const err = {
      status: 406,
      error: `Invalid ID`,
    };
    throw err;
  }
  const return_schedule = await datastore.get(key);
  if (!return_schedule[0]) {
    const err = {
      status: 404,
      error: `No schedule with this id exists`,
    };
    throw err;
  }
  if (return_schedule[0].owner !== owner) {
    const err = {
      status: 403,
      error: `User is forbidden to access schedule`,
    };
    throw err;
  }
  return return_schedule[0];
};

const createSchedule = async (owner, data) => {
  //validate input
  let err = null;
  if (!data.term) {
    err = {
      status: 400,
      error:
        'The request body is missing at least one of the required attributes',
    };
  }
  if (err) {
    throw err;
  }

  //check to make sure term schedule doesn't already exist
  const query = datastore
    .createQuery(SCHEDULE)
    .filter('owner', '=', owner)
    .filter('term', '=', data.term);
  const queryResult = await datastore.runQuery(query);
  const existingSchedule = queryResult[0][0];

  //add new schedule if one doesn't already exist
  if (!existingSchedule) {
    try {
      const result = await datastore.save({
        key: datastore.key(SCHEDULE),
        data: {
          owner: owner,
          term: data.term,
          classes: [],
        },
      });
      const new_id = result[0].mutationResults[0].key.path[0].id;
      const key = datastore.key([SCHEDULE, parseInt(new_id, 10)]);
      const newSchedule = await datastore.get(key);
      return newSchedule[0];
    } catch (err) {
      throw err;
    }
  } else {
    err = {
      status: 403,
      error: 'Schedule already exists',
    };
    throw err;
  }
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

const validateDate = async (schedule, checkDay, checkHour) => {
  for (classId of schedule.classes) {
    checkClass = await getClass(classId);
    //if class not at the same time, go to next class in schedule
    if (checkClass.class_hour !== checkHour) {
      continue;
    }

    //check if any of the days in the class array match the class to add
    if (checkClass.days_of_week.includes(checkDay)) {
      return {
        status: 403,
        error: 'Time slot not available to schedule class',
      };
    }
  }
  return null;
};

const addClass = async (owner, schedule_id, class_id) => {
  try {
    //get user schedule
    const schedule = await getSchedule(owner, schedule_id);

    //check if class is already in schedule
    let error = null;
    for (const id of schedule.classes) {
      if (id === class_id) {
        error = {
          status: 403,
          error: 'Class already in schedule',
        };
      }
    }
    if (error) {
      console.log(error);
      throw error;
    }

    //check if time slot is available
    const classToAdd = await getClass(class_id);
    for (const day of classToAdd.days_of_week) {
      error = await validateDate(schedule, day, classToAdd.class_hour);
      if (error) {
        console.log(error);
        throw error;
      }
    }

    //add class id to classes array and schedule id to schedules array
    schedule.classes.push(class_id);
    classToAdd.schedules.push(schedule_id);

    //update datastore
    try {
      const schedule_results = await datastore.update({
        key: (key = datastore.key([SCHEDULE, parseInt(schedule_id, 10)])),
        data: schedule,
      });

      //add schedule to class array
      await datastore.update({
        key: (key = datastore.key([CLASS, parseInt(class_id, 10)])),
        data: classToAdd,
      });
      return schedule_results;
    } catch (err) {
      throw err;
    }
  } catch (err) {
    console.log(err);
    throw err;
  }
};

const removeClass = async (owner, schedule_id, class_id) => {
  try {
    //get user schedule
    let schedule = await getSchedule(owner, schedule_id);

    //remove class from classes array
    const class_index = schedule.classes.indexOf(class_id);
    if (class_index > -1) {
      schedule.classes.splice(class_index, 1);
    }

    //remove schedule from schedules array
    let classToRemove = await getClass(class_id);
    const schedule_index = classToRemove.schedules.indexOf(schedule_id);
    if (schedule_index > -1) {
      classToRemove.schedules.splice(schedule_index, 1);
    }

    //update datastore
    try {
      await datastore.update({
        key: (key = datastore.key([SCHEDULE, parseInt(schedule_id, 10)])),
        data: schedule,
      });
      await datastore.update({
        key: (key = datastore.key([CLASS, parseInt(class_id, 10)])),
        data: classToRemove,
      });

      return;
    } catch (err) {
      console.log(err);
      throw err;
    }
  } catch (err) {
    throw err;
  }
};

const updateSchedule = async (owner, schedule_id, data) => {
  try {
    let schedule = await getSchedule(owner, schedule_id);

    //if user is trying to update schedules array, throw error
    if (data.classes) {
      throw { status: 400, error: 'Manually updating classes is not allowed' };
    }

    //update schedule name if included in req body
    if (data.term) {
      schedule.term = data.term;
    }

    try {
      await datastore.save({
        key: (key = datastore.key([SCHEDULE, parseInt(schedule_id, 10)])),
        data: schedule,
      });
      schedule = await getSchedule(owner, schedule_id);
      return schedule;
    } catch (err) {
      throw err;
    }
  } catch (err) {
    console.log(err);
    throw err;
  }
};

const deleteSchedule = async (sub, schedule_id) => {
  const schedule = await getSchedule(sub, schedule_id);

  //remove schedule from all user classes
  for (const class_id of schedule.classes) {
    let classEntity = await getClass(class_id);
    const schedule_index = classEntity.schedules.indexOf(schedule_id);
    if (schedule_index > -1) {
      classEntity.schedules.splice(schedule_index, 1);

      //update datastore
      try {
        await datastore.update({
          key: (key = datastore.key([CLASS, parseInt(class_id, 10)])),
          data: classEntity,
        });
      } catch (err) {
        console.log(err);
        throw err;
      }
    }
  }

  // delete schedule
  const schedule_key = datastore.key([SCHEDULE, parseInt(schedule_id, 10)]);
  await datastore.delete(schedule_key);
  return;
};

/************************************ ENDPOINTS ********************************************/

router.post('/', checkJwt, handleError, async (req, res, err) => {
  try {
    if (req.error === 'Invalid Token') {
      throw { status: 401, error: 'Invalid Token' };
    } else {
      const sub = jwtDecode(req.headers.authorization).sub;
      const newSchedule = await createSchedule(sub, req.body);
      newSchedule.id = getId(newSchedule);
      newSchedule.self = `${req.protocol}://${req.get('host')}${req.baseUrl}/${
        newSchedule.id
      }`;
      res.status(201).json(newSchedule);
    }
  } catch (err) {
    return res.status(err.status).send(err.error);
  }
});

router.get('/', checkJwt, handleError, async (req, res, err) => {
  try {
    if (req.error === 'Invalid Token') {
      throw { status: 401, error: 'Invalid Token' };
    } else {
      let cursor = null;
      if (Object.keys(req.query).includes('cursor')) {
        cursor = req._parsedUrl.path.slice(9);
      }
      const sub = jwtDecode(req.headers.authorization).sub;
      let results = await getSchedules(sub, cursor, 5);
      results.schedules = results.schedules.map((item) => {
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
    }
  } catch (err) {
    return res.status(err.status).send(err.error);
  }
});

router.get('/:id', checkJwt, handleError, async (req, res, err) => {
  try {
    if (req.error === 'Invalid Token') {
      throw { status: 401, error: 'Invalid Token' };
    } else {
      const sub = jwtDecode(req.headers.authorization).sub;
      const returnSchedule = await getSchedule(sub, req.params.id);
      returnSchedule.id = req.params.id;
      returnSchedule.self = `${req.protocol}://${req.get('host')}${
        req.baseUrl
      }/${req.params.id}`;
      res.set('Content-Type', 'application/json');
      res.status(200).json(returnSchedule);
    }
  } catch (err) {
    return res.status(err.status).send(err.error);
  }
});

router.get('/:id/classes', checkJwt, handleError, async (req, res, err) => {
  try {
    if (req.error === 'Invalid Token') {
      throw { status: 401, error: 'Invalid Token' };
    } else {
      const sub = jwtDecode(req.headers.authorization).sub;
      const schedule = await getSchedule(sub, req.params.id);
      const classes = schedule.classes.map(async (class_id) => {
        const classEntity = await getClass(class_id);
        return {
          name: classEntity.name,
          description: classEntity.description,
          section: classEntity.section,
          days_of_week: classEntity.days_of_week,
          class_hour: classEntity.class_hour,
        };
      });

      const results = await Promise.all(classes);
      res.set('Content-Type', 'application/json');
      res.status(200).json(results);
    }
  } catch (err) {
    return res.status(err.status).send(err.error);
  }
});

router.put(
  '/:schedule_id/classes/:class_id',
  checkJwt,
  handleError,
  async (req, res, err) => {
    try {
      if (req.error === 'Invalid Token') {
        throw { status: 401, error: 'Invalid Token' };
      } else {
        const sub = jwtDecode(req.headers.authorization).sub;
        try {
          results = await addClass(
            sub,
            req.params.schedule_id,
            req.params.class_id
          );
          const schedule = await getSchedule(sub, req.params.schedule_id);
          schedule.id = req.params.id;
          schedule.self = `${req.protocol}://${req.get('host')}${req.baseUrl}/${
            req.params.schedule_id
          }`;
          res.set('Content-Type', 'application/json');
          res.status(200).json(schedule);
        } catch (err) {
          throw err;
        }
      }
    } catch (err) {
      return res.status(err.status).send(err.error);
    }
  }
);

router.patch('/:id', checkJwt, handleError, async (req, res, err) => {
  try {
    if (req.error === 'Invalid Token') {
      throw { status: 401, error: 'Invalid Token' };
    } else {
      const sub = jwtDecode(req.headers.authorization).sub;
      const updatedSchedule = await updateSchedule(
        sub,
        req.params.id,
        req.body
      );
      updatedSchedule.id = req.params.id;
      updatedSchedule.self = `${req.protocol}://${req.get('host')}${
        req.baseUrl
      }/${req.params.id}`;
      res.set('Content-Type', 'application/json');
      res.status(200).json(updatedSchedule);
    }
  } catch (err) {
    return res.status(err.status).send(err.error);
  }
});

router.delete(
  '/:schedule_id/classes/:class_id',
  checkJwt,
  handleError,
  async (req, res, err) => {
    try {
      if (req.error === 'Invalid Token') {
        throw { status: 401, error: 'Invalid Token' };
      } else {
        const sub = jwtDecode(req.headers.authorization).sub;
        try {
          await removeClass(sub, req.params.schedule_id, req.params.class_id);
          res.sendStatus(204);
        } catch (err) {
          throw err;
        }
      }
    } catch (err) {
      return res.status(err.status).send(err.error);
    }
  }
);

router.delete('/:id', checkJwt, handleError, async (req, res, err) => {
  try {
    const sub = jwtDecode(req.headers.authorization).sub;
    await deleteSchedule(sub, req.params.id);
    res.sendStatus(204);
  } catch (err) {
    console.log(err);
    return res.status(err.status).send(err.error);
  }
});

module.exports = router;
