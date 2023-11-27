require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const fs = require("fs");
const indexRouter = require('./routes/index');
const apiRouter = require('./routes/api');
const apiUserRouter = require('./routes/userApi');
const imageRouter = require('./routes/images');
const cors = require('cors')
const apiResult = require("./lib/api-result2");
const { generateImage, shouldCreateFile } = require("./lib/imageGenerator");
const captchaMiddleware = require('./middleware/captchaMiddleware');
const mongo = require('./lib/mongo');

require('dotenv').config();

const dbInstance = {
  __db: null,
  getDb: async () => {
    if (!dbInstance.__db) {
      dbInstance.__db = await mongo(process.env.MONGO_DB, process.env.MONGO_URL, 20);
    }
    return dbInstance.__db;
  },
  reset: async () => {
    try {
      if (dbInstance.__db) {
        await dbInstance.__db.close();
      }
    } catch (e) {

    }
    dbInstance.__db = null;
  }
}

const app = express();
// app.use(cors())

// app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
// app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/users', apiUserRouter(dbInstance));
app.use('/api', captchaMiddleware(process.env.CAPTCHA_SECRET_KEY), apiRouter(dbInstance));
app.use('/', imageRouter(dbInstance));
app.use('/', indexRouter(dbInstance));
app.use('/images/generated/', async (req, res, next) => {
  const identity = path.basename(req.path).replace(/\.png$/, '');
  const cachePathJson = path.join(__dirname, 'cache', identity + '.json');
  let userInfo;
  if (shouldCreateFile(cachePathJson)) {
    let address = identity;
    if (!identity.match(/^0x[0-9a-f]{40}$/)) {
      address = await apiResult.getAddressByTwitter(await dbInstance.getDb(), identity);
      if (!address) {
        return res.status(404).send({ error: 'Not found' });
      }
    }
    userInfo = await apiResult.getUserForImage(await dbInstance.getDb(), address);
    if (!userInfo) {
      return res.status(404).send('File not found');
    }
  } else {
    userInfo = JSON.parse(fs.readFileSync(cachePathJson).toString());
  }

  try {
    const filePath = await generateImage(userInfo);
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
  } catch (e) {
  }
  return res.status(404).send({ error: 'Not found' });
});

module.exports = app;
