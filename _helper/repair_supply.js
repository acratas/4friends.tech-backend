require('dotenv').config({
  path: '../.env'
});
console.log(process.env);
const MongoClient = require('mongodb').MongoClient;

async function updateSupplyAndHoldings() {
  const client = await MongoClient.connect(process.env.MONGO_URL);
  const db = client.db(process.env.MONGO_DB);

  const userLimit = 100; // Users to process in one batch
  let lastId = null; // Last processed user ID
  let records = 0;

  while (true) {
    console.log(`Processing ${records} - ${records + userLimit} recrods...`)
    // Get users
    const usersCursor = db.collection('users').find(lastId ? { _id: { $gt: lastId } } : {}).limit(userLimit).sort({ _id: 1 });
    let processedUsers = 0; // Count processed users in this batch

    while (await usersCursor.hasNext()) {
      records++;
      const user = await usersCursor.next();
      lastId = user._id;
      processedUsers++;

      const transactionsCursor = db.collection('transactions').find({ trader: user._id, subject: user._id });
      let selfHoldings = 0;
      while(await transactionsCursor.hasNext()) {
        const transaction = await transactionsCursor.next();
        selfHoldings += transaction.isBuy ? transaction.amount : -transaction.amount;
      }

      const latestTransaction = await db.collection('transactions').findOne({ subject: user._id }, { sort: { timestamp: -1 } });
      const newSupply = latestTransaction ? latestTransaction.supply : 0;

      await db.collection('users').updateOne(
        { _id: user._id },
        { $set: { selfHoldings: selfHoldings, supply: newSupply, supplyBlock: user.supplyBlock ?? 0 } }
      );
    }

    if (processedUsers < userLimit) {
      break;
    }
  }

  client.close();
}

updateSupplyAndHoldings().catch(console.error);
