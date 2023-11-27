const axios = require('axios');
const mongo = require("./lib/mongo");
const { sleep } = require("./lib/utils");
const { MongoNetworkError } = require("mongodb");

async function getBlockNumberFromBasescan() {
  const response = await axios.get('https://api.basescan.org/api?module=proxy&action=eth_blockNumber');
  return parseInt(response.data.result, 16) - 100;
}

async function run(db) {
  const transactionsCollection = db.collection('transactions');
  const usersCollection = db.collection('users');
  // Aggregation query
  const cursor = transactionsCollection.aggregate([
    {
      $group: {
        _id: '$subject',
        newAmount: {
          $sum: {
            $cond: ["$isBuy", "$amount", { $multiply: [-1, "$amount"] }]
          }
        }
      }
    }
  ]);

  const blockNumber = await getBlockNumberFromBasescan();
  let cnt = 0;

  // Iterating over the cursor
  for await (const result of cursor) {
    await usersCollection.updateOne(
      {
        _id: result._id,
        $or: [
          { supplyBlock: { $lt: blockNumber } },
          { supplyBlock: { $exists: false } }
        ]
      },
      {
        $set: {
          supply: result.newAmount,
          supplyBlock: blockNumber
        }
      }
    );
    cnt++;
  }
  console.log('Update completed', cnt);
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
    await sleep(1000 * 60 * 60);
  }

})();

