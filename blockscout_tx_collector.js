require('dotenv').config();

const axios = require('axios');
const Bottleneck = require('bottleneck');
const mongo = require('./lib/mongo');
const { sleep } = require("./lib/utils");
const path = require('path');
const { MongoNetworkError } = require("mongodb");

const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 250
});

const getDataFromBlockscout = async (url, queryParams = {}) => {
  url = new URL(url);
  url.searchParams.set('apikey', process.env.BLOCKSCOUT_API_KEY);
  for (let key in queryParams) {
    url.searchParams.set(key, queryParams[key]);
  }
  console.log(new Date(), `[GET] ${url.toString()}`);
  return await axios.get(url.toString());
}

const run = async (db) => {
  const url = `${process.env.BLOCKSCOUT_URL}/addresses/${process.env.CONTRACT_ADDRESS}/transactions`;
  const id = path.basename(__filename);
  let params = await db.collection('config').findOne({ _id: id }) || {};
  let response;
  do {
    response = await limiter.schedule(() => getDataFromBlockscout(url, params ? params.data : {}));
    params['data'] = response.data.next_page_params;
    await db.collection('config').updateOne({ _id: id }, { $set: params }, { upsert: true });
    for (let transaction of response.data.items) {
      try {
        await db.transactions.setFromTx(transaction);
      } catch (e) {
        console.error(e)
      }
    }
  } while (response.data.next_page_params !== null);
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
      console.error('toJSON' in e ? e.toJSON() : e);
    }
    await sleep(1000 * 60 * 3);
  }

})();
