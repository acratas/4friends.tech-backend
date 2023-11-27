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

const getUser = async (address, ftLastUpdated) => {
  console.log(new Date(ftLastUpdated), `[GET] https://prod-api.kosetto.com/users/${address}`);
  const response = await axios.get(`https://prod-api.kosetto.com/users/${address}`, {
    timeout: 1000
  });
  return response.data;
}

const run = async (db) => {
  const cursor = db.collection('users')
    .find({}, { projection: { _id: 1, ftLastUpdated: 1 } })
    .sort({ftLastUpdated: 1})
    .limit(100);
  for await (const _user of cursor) {
    let user;
    try {
      user = await limiter.schedule(() => getUser(_user._id, _user.ftLastUpdated));
      await db.users.setFromFriendTech(user);
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
        await db.users.setFromFriendTech(user);
      } else {
        console.error(e);
        //throw e;
      }
    }
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
    await sleep(1000 * 60);
  }

})();
