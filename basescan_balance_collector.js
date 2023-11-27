require('dotenv').config();
const { sleep } = require("./lib/utils");
const mongo = require('./lib/mongo');
const axios = require("axios");
const BN = require("bn.js");
const { MongoNetworkError } = require("mongodb");

const get = async (addresses) => {
  const url = `${process.env.BASESCAN_URL}?limit=100&module=account&action=balancemulti&address=${addresses}&tag=latest&apiKey=${process.env.BASESCAN_API_KEY}`;
  console.log(new Date(), `[GET] ${url} ${url.length}`);
  const response = await axios.get(url.toString());
  return response.data;
}

const run = async (db) => {

  while (true) {

    const addresses = await db
      .collection('users')
      .find({})
      .project({ _id: 1, walletPriority: 1, walletLastUpdated: 1 })
      .sort({
        walletPriority: 1,
        walletLastUpdated: 1,
        supply: -1
      })
      .limit(20)
      .toArray();

    const response = await get(addresses.map(({ _id }) => _id).join(','));

    for (let data of response.result) {
      const wei = new BN(data.balance);
      const ether = wei.div(new BN('1000000000000000000'));
      const remainder = wei.mod(new BN('1000000000000000000'));
      const etherFloat = parseFloat(ether.toString() + '.' + remainder.toString().substring(0, 5));
      await db.collection('users').updateOne({ _id: data.account }, {
        $set: {
          walletBalance: etherFloat,
          walletLastUpdated: new Date(),
          walletPriority: -1
        }
      });
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
      console.error(new Date(), 'toJSON' in e ? e.toJSON() : e);
    }
    await sleep(1000 * 60);
  }
})();
