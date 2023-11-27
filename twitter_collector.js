require('dotenv').config();

const Bottleneck = require('bottleneck');
const mongo = require('./lib/mongo');
const { sleep } = require("./lib/utils");
const twitter = require('./lib/twitter');
const { MongoNetworkError } = require("mongodb");

const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 3100
});

const getUsers = twitter(
  process.env.TWITTER_CONSUMER_KEY,
  process.env.TWITTER_CONSUMER_SECRET,
  process.env.TWITTER_ACCESS_TOKEN,
  process.env.TWITTER_ACCESS_TOKEN_SECRET
).getUsers;


const run = async (db) => {

  try {
    while (true) {
      const users = await db.collection('users')
        .find({
          twitterUserId: { $exists: true, $ne: null }
        }, { projection: { _id: 1, twitterUserId: 1, twitterName: 1, supply: 1 } })
        .sort({ twitterLastUpdated: 1 })
        .limit(100)
        .toArray();
      const twitterIds = users.reduce((acc, user) => ({ ...acc, [user.twitterUserId]: user._id }), {});
      const twitterUsers = await limiter.schedule(() => getUsers(Object.keys(twitterIds)));
      for (const twitterUser of twitterUsers) {
        console.log(`Update: ${twitterUser.screen_name} (${twitterUser.id_str})`);
        await db.users.setFromTwitter(twitterUser);
        delete twitterIds[twitterUser.id_str];
      }
      for (const twitterId in twitterIds) {
        const _id = twitterIds[twitterId];
        console.log(`Update: ${_id} (null)`);
        await db.collection('users').updateOne({ _id }, { $set: { twitterLastUpdated: Date.now() } });
      }
    }
  } catch (e) {
    console.error(e.code, e.allErrors, e.twitterReply);
    throw e;
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
