require('dotenv').config({
  path: '../.env'
});
const mongo = require('../lib/mongo');
const BN = require("../node_modules/bn.js");

const weiToEth = new BN('1000000000000000000'); // 1 ETH w Wei

async function getTransactionCounts() {
  const db = await mongo(process.env.MONGO_DB, process.env.MONGO_URL);
  const collection = db.collection("transactions");

  try {

    for (let i = 0; i <= 10; i++) {
      const thresholdInWei = new BN(i).mul(weiToEth).toString();
      const count = await collection.countDocuments({
        $expr: {
          $gte: [{ $strLenCP: "$value" }, thresholdInWei.length]
        }
      });
      console.log(`Transactions above ${i} ETH: ${count}`)
    }
  } catch (e) {
    console.error(e)
  }
    await db.close();

}

getTransactionCounts();
