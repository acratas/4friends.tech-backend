require('dotenv').config();

const Bottleneck = require('bottleneck');
const mongo = require('./lib/mongo');
const { sleep } = require("./lib/utils");
const twitter = require('./lib/twitter');

const axios = require('axios');
const { MongoNetworkError } = require("mongodb");

const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 333
});

const getUser = twitter(
  process.env.TWITTER_CONSUMER_KEY,
  process.env.TWITTER_CONSUMER_SECRET,
  process.env.TWITTER_ACCESS_TOKEN,
  process.env.TWITTER_ACCESS_TOKEN_SECRET
).getUser;

const checkImageUrl = async (url) => {
  try {
    const response = await axios.get(url);
    console.log(`[${response.status}] ${url}`);
    return response.status < 400;
  } catch (e) {
    return false;
  }
}

const run = async (db) => {
  const cursor = db.collection('users')
    .find({
      twitterUserId: { $exists: true },
    }, { projection: {
      twitterUserId: 1
    } })
    .sort({
      twitterLastUpdated: 1,
      twitterPfpUrl: 1
    })
    .limit(1000);
  for await (const user of cursor) {

    let twitterUser;
    let i = 0;
    while (i < 3) {
      try {
        if (user.twitterUserId === null) {
          throw {
            code: 50
          };
        }
        twitterUser = await limiter.schedule(() => getUser(user.twitterUserId));
        i = 3;
      } catch (e) {
        if (e.code === 50 || e.code === 63) {
          twitterUser = {
            id_str: user.twitterUserId,
            followers_count: 0
          };
          i = 3;
        } else {
          i++;
          await sleep(1000 * 60)
        }
      }
      if (twitterUser.id_str) {
        console.log(twitterUser.id_str, twitterUser.screen_name);
        await db.users.setFromTwitter(twitterUser);
      } else {
        db.collection('users')
          .updateOne({ twitterUserId: user.twitterUserId }, { $set: { twitterLastUpdated: Date.now() } });
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
    await db.close();
    await sleep(1000 * 60 * 3);
  }
})();
