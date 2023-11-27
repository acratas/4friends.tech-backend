require('dotenv').config({
  path: '../.env'
});
const mongo = require('../lib/mongo');


  (async () => {
    const db = await mongo(process.env.MONGO_DB, process.env.MONGO_URL);
    const BATCH_SIZE = 1000;
    let skip = 0;

    while (true) {

      console.log(`Processing ${skip} - ${skip + BATCH_SIZE}...`);

      const pipeline = [
        { $skip: skip },
        { $limit: BATCH_SIZE },
        {
          $addFields: {
            hasNoTimestamp: {
              $cond: [{ $ifNull: ["$timestamp", false] }, 1, 0]
            }
          }
        },
        {
          $sort: {
            hasNoTimestamp: -1,
            timestamp: -1
          }
        }
      ];

      const cursor = db.collection('transactions').aggregate(pipeline);
      let hasData = false;

      for await (const doc of cursor) {
        hasData = true;
        const subject = await db.collection('users').findOne({_id: doc.subject});
        const trader = await db.collection('users').findOne({_id: doc.trader});

        if (!subject && doc.subject) {
          await db.collection('users').insertOne({
            _id: doc.subject,
            supply: doc.supply,
          });
        }

        if (!trader && doc.trader) {
          await db.collection('users').insertOne({
            _id: doc.trader,
            supply: 0,
          });
        }
      }

      if (!hasData) break;  // If there is no data, we are done

      skip += BATCH_SIZE;  // Move to the next batch
    }
  })();
