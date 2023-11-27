const express = require('express');
const apiResult = require("../lib/api-result2");
const web3 = require('web3');
const { MongoNetworkError } = require("mongodb");
const axios = require("axios");
const twitter = require("../lib/twitter");
const { sleep } = require("../lib/utils");
const router = express.Router();

const getUser = twitter(
  process.env.TWITTER_CONSUMER_KEY,
  process.env.TWITTER_CONSUMER_SECRET,
  process.env.TWITTER_ACCESS_TOKEN,
  process.env.TWITTER_ACCESS_TOKEN_SECRET
).getUser;
let dbInstance;

/* GET users listing. */
router.get('/:address', async function (req, res, next) {
  const start = Date.now();
  try {
    let address = req.params.address.toLowerCase().replace(/^@/, '');
    // res.setHeader('Access-Control-Allow-Origin', '*');
    if (!web3.utils.isAddress(address)) {
      address = await apiResult.getAddressByTwitter(await dbInstance.getDb(), req.params.address);
      if (!address || !web3.utils.isAddress(address)) {
        console.log(`[${req.method}] ${req.originalUrl}: ` + (Date.now() - start) + 'ms');
        return res.redirect(302, '/');
      }
    }
    console.log(`[${req.method}] ${req.originalUrl}: ` + (Date.now() - start) + 'ms');
    return res.send(await apiResult.getUser(await dbInstance.getDb(), address));
  } catch (error) {
    if (error instanceof MongoNetworkError) {
      await dbInstance.reset();
    }
    console.log(error);
    res.status(500).send('Error while processing request');
  }
  console.log(`[${req.method}] ${req.originalUrl}: ` + (Date.now() - start) + 'ms');
});

router.get('/autocomplete/:name', async function (req, res, next) {
  console.log(`[${req.method}] ${req.originalUrl}`);
  try {
    const name = req.params.name.replace(/^@/, '');
    // console.warn(new Date(), '[NAME]', name);
    // res.setHeader('Access-Control-Allow-Origin', '*');
    if (!name.match(/^[a-z0-9A-Z_]{3,}$/)) {
      res.status(400).send({ error: 'Invalid name' });
      return;
    }
    return res.send(await apiResult.getAutocomplete(await dbInstance.getDb(), name));
  } catch (error) {
    if (error instanceof MongoNetworkError) {
      await dbInstance.reset();
    }
    console.log(error);
    res.status(500).send({ error: 'Server error' });
  }
});

router.get('/my/random/holder', async function (req, res, next) {
  console.log(`[${req.method}] ${req.originalUrl}`);
  try {
    const alojzy = await apiResult.getUser(await dbInstance.getDb(), '0xe4b2e46ca1feada536868cd65bffa1f49983fe9e');
    const holders = alojzy.holders.reduce((acc, h) => {
      // console.log(h.trader, h.isBuy, h.amount, h.isBuy ? h.amount : -h.amount)
      if (!acc[h.trader]) {
        acc[h.trader] = {
          address: h.trader,
          balance: 0,
        }
      }
      acc[h.trader].balance += h.isBuy ? h.amount : -h.amount;
      return acc;
    }, {});
    const arrHolders = Object.values(holders).filter((p) => p.balance > 0);
    const randomHolder = arrHolders[Math.floor(Math.random() * arrHolders.length)];
    return res.send(await apiResult.getUser(await dbInstance.getDb(), randomHolder.address));
  } catch (error) {
    if (error instanceof MongoNetworkError) {
      await dbInstance.reset();
    }
    res.status(500).send({ error: 'Server error' });
  }
});

router.get('/short/:address', async function (req, res, next) {
  console.log(`[${req.method}] ${req.originalUrl}`);
  try {
    const db = await dbInstance.getDb();
    const user = await db.collection('users').findOne({ _id: req.params.address.toLowerCase() });
    if (!user.twitterUsername) {
      throw new Error('User not found');
    }
    return res.send({
      ...user,
      address: user._id,
      _id: undefined,
      epoch: undefined,
      pointsLastUpdated: undefined,
      walletLastUpdated: undefined,
      twitterLastUpdated: undefined,
      ftLastUpdated: undefined,
    });
  } catch (error) {
    console.log(error);
    if (error instanceof MongoNetworkError) {
      await dbInstance.reset();
    }
    try {
      console.log(`Load: https://prod-api.kosetto.com/users/${req.params.address.toLowerCase()}`)
      let steps = 1;
      let response;
      while (steps < 3) {
        try {
          response = await axios.get(`https://prod-api.kosetto.com/users/${req.params.address.toLowerCase()}`, {
            timeout: 1000
          });
          break;
        } catch (error) {
          console.log(`Step #${steps} failed`)
          await sleep(1000);
          steps++;
        }
      }

      if (response.data.twitterUserId) {
        try {
          const twitterUser = await getUser(response.data.twitterUserId);
          if (twitterUser) {
            response.data.twitterName = twitterUser.name;
            response.data.twitterUsername = twitterUser.screen_name;
            response.data.twitterPfpUrl = twitterUser.profile_image_url_https;
            response.data.followers_count = twitterUser.followers_count;
            response.data.twitterUsername = twitterUser.screen_name;
            response.data.twitterVerified = twitterUser.verified ? 1 : 0;
            response.data.twitterFriendsCount = twitterUser.friends_count;
            response.data.twitterFavoritesCount = twitterUser.favourites_count;
            response.data.twitterStatusesCount = twitterUser.statuses_count;
            response.data.twitterCreatedAt = (new Date(twitterUser.created_at)).getTime();
            response.data.twitterLastUpdated = Date.now();
          }
        } catch (error) {
          console.log(error);
        }
      }
      res.send(response.data);
      try {
        const db = await dbInstance.getDb();
        await db.users.setFromFriendTech(response.data);
        await db.users.setFromTwitter(response.data);
        await db.users.initSupply(response.data.address.toLowerCase());
      } catch (error) {
        console.log(error);
      }
      return;
    } catch (error) {
      console.log(error);
    }

    res.status(500).send({ error: 'Server error' });
  }
});

module.exports = (_dbInstance) => {
  dbInstance = _dbInstance;
  return router;
}
