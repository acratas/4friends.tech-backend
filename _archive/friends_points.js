require('dotenv').config();

const axios = require('axios');
const Bottleneck = require('bottleneck');
const mongo = require('./lib/mongo');
const { sleep } = require("./lib/utils");
const path = require("path");
const fs = require("fs");
const { MongoNetworkError } = require("mongodb");

const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 10
});

const getUser = async (address) => {
  const url = `https://prod-api.kosetto.com/points/${address}`;
  console.log(new Date(), `[GET] ${url}`);
  const response = await axios.get(`${url}`, {
    timeout: 1000,
    headers: {
      'Authorization': process.env.FRIENDTECH_QUERY_TOKEN
    },
    // proxy: {
    //   host: '80.211.205.99',
    //   port: 3128,
    //   protocol: 'http'
    // }
  });
  return response.data;
}

const run = async (db) => {
  const cursor = db.collection('users')
    .find({ twitterName: { $ne: '[BOT]' } }, { projection: { _id: 1 } })
    .sort(
      {
        pointsLastUpdated: 1,
        supply: -1
      }
    )
    .limit(1000);
  for await (const _user of cursor) {
    let user;
    try {
      user = await limiter.schedule(() => getUser(_user._id));
    } catch (err) {
      const e = err.toJSON();
      if (e.status === 404) {
        user = {
          address: _user._id,
          totalPoints: null,
          tier: null,
          leaderboard: null
        };
      } else {
        console.error(e);
        throw e;
      }
    }
    await db.collection('users').updateOne({
      _id: user.address
    }, {
      $set: {
        pointsLastUpdated: Math.floor(Date.now() / 1000),
        points: user.totalPoints,
        tier: user.tier,
        leaderboard: user.leaderboard
      }
    });
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
