require('dotenv').config({
  path: '../.env'
});

const axios = require('axios');
const Bottleneck = require('bottleneck');
const { sleep } = require("../lib/utils");

const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 100
});

const getUser = async (address, ftLastUpdated) => {
  const response = await axios.get(`https://prod-api.kosetto.com/users/${address}`, {
    timeout: 1000
  });
  console.log(new Date(ftLastUpdated), `[GET] https://prod-api.kosetto.com/users/${address}`);
  return response.data;
}

const run = async (db, offset, limit = 100) => {
  const cursor = db.collection('users')
    .find({ twitterName: { $ne: '[BOT]' } }, { projection: { _id: 1, ftLastUpdated: 1 } })
    .sort({ftLastUpdated: 1})
    .skip(offset * limit)
    .limit(limit);
  for await (const _user of cursor) {
    let user;
    try {
      user = await limiter.schedule(() => getUser(_user._id, _user.ftLastUpdated));
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
      } else if (e.status === 403) {
        await sleep(30000);
        continue;
      } else if (e.status >= 500) {
        await sleep(30000);
        continue;
      } else if (e.code === 'ECONNABORTED') {
        await sleep(1000);
        continue;
      } else {
        console.error(e);
        continue;
      }
    }
    await db.users.setFromFriendTech(user);
  }
}

module.exports = run;
