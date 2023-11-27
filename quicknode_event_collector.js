require('dotenv').config();

const quicknode = require('./lib/quicknode')(process.env.PROVIDER_URL, process.env.PROVIDER_WSS, process.env.CONTRACT_ADDRESS);
const { sleep } = require('./lib/utils');
const mongo = require('./lib/mongo');


const run = async (db) => {

  const contract = quicknode.ws();
  contract.events.Trade({
    fromBlock: process.argv[2] || 'latest'
  }).on('data', async (event) => {
    await db.users.setFromEvent(event);
    await db.transactions.setFromEvent(event);
  }).on('error', async (err) => {
    console.error(err);
    await db.close();
  });

}


(async () => {
  const db = await mongo(process.env.MONGO_DB, process.env.MONGO_URL);
  while (true) {

    try {
      await run(db);
    } catch (e) {
      console.error('toJSON' in e ? e.toJSON() : e);
    }
    await sleep(1000 * 60 * 3);
  }
})();
