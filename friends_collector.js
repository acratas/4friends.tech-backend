require('dotenv').config();

const axios = require('axios');
const Bottleneck = require('bottleneck');
const mongo = require('./lib/mongo');
const { sleep } = require("./lib/utils");
const { MongoNetworkError } = require("mongodb");

const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 333
});

const getUser = async (address) => {
  console.log(new Date(), `[GET] https://prod-api.kosetto.com/users/${address}`);
  const response = await axios.get(`https://prod-api.kosetto.com/users/${address}`, {
    timeout: 1000
  });
  return response.data;
}

const run = async (db) => {
  const cursor = db.collection('users').find({ twitterName: { $exists: false } }, { projection: { _id: 1 } });
  for await (const _user of cursor) {
    let user;
    try {
      user = await limiter.schedule(() => getUser(_user._id));
    } catch (err) {
      const e = err.toJSON();
      if (e.status === 404) {
        user = {
          address: _user._id,
          twitterName: '[BOT]',
          twitterUsername: null,
          twitterPfpUrl: null,
          twitterUserId: null
        };
      } else {
        console.error(e);
        throw e;
      }
    }
    await db.users.setFromFriendTech(user);
  }
}

(async () => {
  const db = await mongo(process.env.MONGO_DB, process.env.MONGO_URL);
  while (true) {

    try {
      await run(db);
    } catch (e) {
      if (e instanceof MongoNetworkError) {
        console.error("MongoDB connection lost. Exiting.");
        process.exit(1);
      }
      console.error(e);
    }
    await sleep(1000 * 60 * 3);
  }

})();
