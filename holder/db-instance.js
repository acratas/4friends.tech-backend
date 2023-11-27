const mongo = require("../lib/mongo");
const { MongoNetworkError } = require("mongodb");
require('dotenv').config({
  path: '../.env'
});

const dbInstance = {
  __db: null,
  getDb: async () => {
    if (!dbInstance.__db) {
      dbInstance.__db = await mongo(process.env.MONGO_DB, process.env.MONGO_URL, 1);
    }
    return dbInstance.__db;
  },
  reset: async () => {
    try {
      if (dbInstance.__db) {
        await dbInstance.__db.close();
      }
    } catch (e) {

    }
    dbInstance.__db = null;
  },
  exec: async (fn) => {
    try {
      return await fn(await dbInstance.getDb());
    } catch (e) {
      console.error(e);
      if (e instanceof MongoNetworkError) {
        process.exit(1);
      }
    }
  },
  userList: async (items) => {
    if (!items) {
      return [];
    }
    items = items.split(',')
      .map(item => item.trim().replace('@', ''))
      .map(item => new RegExp(`^${item}$`, 'i'));
    return await dbInstance.exec(async (db) => {
      const users = await db.collection('users')
        .find({
            $or: [
              { _id: { $in: items } },
              { twitterName: { $in: items } },
              { twitterUsername: { $in: items } }
            ]
          },
          { projection: { _id: 1 } }
        ).toArray();
      return users.map(item => item._id);
    });
  },
  getHoldings: async (address) => {
    const holdings = await dbInstance.exec(async (db) => await db.collection('transactions').aggregate([
        {
          $match: {
            trader: address
          }
        },
        {
          $group: {
            _id: "$subject",
            netPurchase: {
              $sum: {
                $cond: [{ $eq: ["$isBuy", true] }, "$amount", { $multiply: ["$amount", -1] }]
              }
            }
          }
        },
        {
          $project: {
            subject: "$_id",
            _id: 0,
            netPurchase: 1
          }
        },
        {
          $match: {
            netPurchase: { $gt: 0 }
          }
        }
      ]).toArray());
    return holdings.map(item => item.subject);
  },
}

module.exports = dbInstance;
