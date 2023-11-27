require('dotenv').config();

const mongo = require('./lib/mongo');
const { sleep } = require("./lib/utils");
const { MongoNetworkError } = require("mongodb");


const run = async (db) => {
  const usersCollection = db.collection('users');
  const transactionsCollection = db.collection('transactions');
  const cursor = usersCollection.find({ supply: { $exists: false } }).limit(1000);
  for await (const user of cursor) {
    console.log('Updating supply for', user._id);
    const transactions = await transactionsCollection.find({ subject: user._id }).toArray();
    let supply = 0;
    transactions.forEach(transaction => {
      supply += transaction.isBuy ? transaction.amount : -transaction.amount;
    });
    await usersCollection.updateOne({ _id: user._id }, { $set: { supply: supply } });
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
