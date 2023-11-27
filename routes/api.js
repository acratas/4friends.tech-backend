const express = require('express');
const router = express.Router();
const undervalued = require('../services/undervalued');
const { MongoNetworkError } = require("mongodb");
const _auth = require("../lib/auth");

let dbInstance;

router.post('/undervalued', async function (req, res, next) {
  const { status, responseData } = await undervalued(await dbInstance.getDb(), req.body)
  try {
    res.status(status)
      .send(responseData);
  } catch (error) {
    if (error instanceof MongoNetworkError) {
      await dbInstance.reset();
    }
    res.status(500).send({ error: 'Server error' });
  }
});

router.post('/auth/token', async function (req, res, next) {
  const db = await dbInstance.getDb();
  const auth = _auth(db, process.env.AUTH_MESSAGE, process.env.AUTH_SECRET);
  const token = await auth.getToken(req.body.signature);
  console.log(req.body, token);
  if (token) {
    res.status(200).send({ token });
  } else {
    res.status(401).send({ error: 'Unauthorized' });
  }
});

router.post('/auth/refresh', async function (req, res, next) {
  const db = await dbInstance.getDb();
  const auth = _auth(db, process.env.AUTH_MESSAGE, process.env.AUTH_SECRET);
  const oldToken = req.body.token;
  const token = await auth.refreshToken(oldToken);
  if (token) {
    res.status(200).send({ token });
  } else {
    res.status(401).send({ error: 'Unauthorized' });
  }
});

module.exports = (_dbInstance) => {
  dbInstance = _dbInstance;
  return router;
}
