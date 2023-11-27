const MongoClient = require('mongodb').MongoClient;
const whaleAlert = require('./whale_alert_client').whaleAlert;


/**
 * Database schema:
 * friends2: {
 *   users: [{
 *     _id: address,
 *
 *     twitterName?: string,
 *     twitterUsername?: string,
 *     twitterPfpUrl?: string,
 *     twitterUserId?: string,
 *
 *     twitterFollowers?: number,
 *
 *     supply?: number,
 *     supplyBlock?: number,
 *     selfHoldings?: number,
 *
 *     holderCount?: number,
 *     holdingCount?: number,
 *     lastMessageTime?: number,
 *     lastOnline?: number,
 *     shareSupply?: number,
 *     watchlistCount?: number,
 *     ftLastUpdated: Date.now(),
 *
 *
 *     twitterVerified: bool,
 *     twitterFriendsCount: number,
 *     twitterFavoritesCount: number,
 *     twitterStatusesCount: number,
 *     twitterCreatedAt: number,
 *     twitterLastUpdated: number,
 *
 *     walletBalance: number,
 *     walletLastUpdated: number,
 *     walletPriority: number,
 *
 *     points: number,
 *     tier: string,
 *     leaderboard: number,
 *     pointsLastUpdated: number,
 *
 *   }],
 *   transactions: [{
 *     _id: txHash,
 *
 *     trader?: address,
 *     subject?: address,
 *     isBuy?: boolean,
 *     amount?: number,
 *     value?: number,
 *     protocolFee?: number,
 *     subjectFee?: number,
 *     supply?: number,
 *     blockNumber?: number,
 *     transactionIndex?: number,
 *
 *     fee?: number,
 *   }]
 * }
 */

const findOneByIdx = async (collection, idx) => await collection.findOne({ _id: idx.toLowerCase() });
const set = async (collection, idx, data, additional = {}) => {
  idx = `${idx}`.toLowerCase();
  await collection.updateOne({ _id: idx }, { $set: data, ...additional }, { upsert: true });
}

const transactions = (collection) => ({
  get: async (txHash) => await findOneByIdx(collection, txHash),
  setFromTx: async (tx) => {
    const { hash, fee, timestamp } = tx;
    await set(collection, hash, { fee: fee.value.toString(), timestamp: timestamp });
  },
  setFromEvent: async (event) => {
    const { transactionHash, returnValues, blockNumber, transactionIndex } = event;
    const data = {
      trader: returnValues.trader.toLowerCase(),
      subject: returnValues.subject.toLowerCase(),
      isBuy: returnValues.isBuy,
      amount: parseInt(returnValues.shareAmount),
      value: returnValues.ethAmount,
      protocolFee: returnValues.protocolEthAmount,
      subjectFee: returnValues.subjectEthAmount,
      supply: parseInt(returnValues.supply),
      blockNumber,
      transactionIndex
    }
    const additional = {};
    if (event.timestamp) {
      data.timestamp = event.timestamp;
    }
    await set(collection, transactionHash, data, additional);
    whaleAlert({
      ...data,
      tx_hash: transactionHash,
    });
  },
  setFromLog: async (log) => {
    const { tx_hash, decoded, block_number, index } = log;
    const data = {
      trader: decoded.parameters[0].value.toLowerCase(),
      subject: decoded.parameters[1].value.toLowerCase(),
      isBuy: decoded.parameters[2].value === 'true',
      amount: parseInt(decoded.parameters[3].value),
      value: decoded.parameters[4].value,
      protocolFee: decoded.parameters[5].value,
      subjectFee: decoded.parameters[6].value,
      supply: parseInt(decoded.parameters[7].value),
      blockNumber: block_number,
      transactionIndex: index,
    }
    await set(collection, tx_hash, data);
    whaleAlert({
      ...data,
      tx_hash,
    });
  },
});

const _setSupply = async (collection, subject, supply, trader, block, increment) => {
  const doc = await findOneByIdx(collection, subject);
  if (doc) {
    await collection.updateOne({
      _id: subject,
      supplyBlock: { $lt: block }
    }, { $set: {
        supply: supply,
        supplyBlock: block,
        walletPriority: 1
      }, $inc: {
        selfHoldings: increment
      } });
  } else {
    await collection.insertOne({
      _id: subject,
      supply: supply,
      selfHoldings: increment,
      supplyBlock: block,
      walletPriority: 1
    });
  }
  await collection.updateOne(
    { _id: trader },
    {
      $set: {
        walletPriority: 1
      },
      $setOnInsert: {
        supply: 0
      }
    },
    {
      upsert: true
    }
  );
};
const users = (collection) => ({
  get: async (address) => await findOneByIdx(collection, address),
  setFromFriendTech: async (friendTech) => {
    const {
      address,
      twitterName,
      twitterUsername,
      twitterPfpUrl,
      twitterUserId,
      holderCount,
      holdingCount,
      lastMessageTime,
      lastOnline,
      shareSupply,
      watchlistCount
    } = friendTech;

    if (address === null) {
      await collection.deleteMany({ _id: null });
      console.warn('Deleted null address');
      return;
    }

    await set(collection, address, {
      twitterName,
      twitterUsername,
      twitterUserId,
      holderCount,
      holdingCount,
      lastMessageTime : parseInt(lastMessageTime) || 0,
      lastOnline: parseInt(lastOnline) || 0,
      shareSupply,
      watchlistCount,
      ftLastUpdated: Date.now(),
    }, {
      $setOnInsert: {
        twitterPfpUrl
      }
    });
  },
  setFromEvent: async (event) => {
    const { returnValues, blockNumber, transactionIndex } = event;
    const subject = returnValues.subject.toLowerCase();
    const trader = returnValues.trader.toLowerCase();
    const supply = parseInt(returnValues.supply);
    const block = blockNumber * 100000 + transactionIndex;
    const increment = returnValues.trader === returnValues.subject
      ? (returnValues.isBuy ? 1 : -1)
      : 0;
    await _setSupply(collection, subject, supply, trader, block, increment);
  },
  setFromLog: async (log) => {
    const { decoded, block_number, index } = log;
    const subject = decoded.parameters[1].value.toLowerCase();
    const trader = decoded.parameters[0].value.toLowerCase();
    const supply = parseInt(decoded.parameters[7].value);
    const block = block_number * 100000 + index;
    const increment = decoded.parameters[0].value.toLowerCase() === decoded.parameters[1].value.toLowerCase()
      ? (decoded.parameters[2].value === 'true' ? 1 : -1)
      : 0;
    await _setSupply(collection, subject, supply, trader, block, increment);
  },
  setFromTwitter: async (twitterUser) => {
    const { id_str, name, screen_name, followers_count, profile_image_url_https } = twitterUser;
    const set = { followers_count }
    if (name) set.twitterName = name;
    if (screen_name) set.twitterUsername = screen_name;
    if (profile_image_url_https) set.twitterPfpUrl = profile_image_url_https;
    set.twitterVerified = twitterUser.verified ? 1 : 0;
    set.twitterFriendsCount = twitterUser.friends_count;
    set.twitterFavoritesCount = twitterUser.favourites_count;
    set.twitterStatusesCount = twitterUser.statuses_count;
    set.twitterCreatedAt = (new Date(twitterUser.created_at)).getTime();
    set.twitterLastUpdated = Date.now();

    await collection.updateOne({ twitterUserId: id_str }, {
      $set: set,
    }, { upsert: true });
  },
  autocomplete: async (query) => {
    const escapeStringRegexp = await import('escape-string-regexp');
    query = escapeStringRegexp.default(query);
    return await collection.find({
      $or: [
        { twitterName: new RegExp('^' + query, 'i') },
        { twitterUsername: new RegExp('^' + query, 'i') }
      ]
    })
      .sort({ supply: -1, followers_count: -1 })
      .limit(10)
      .toArray()
  },
  getByTwitterUsername: async (username) => {
    const escapeStringRegexp = await import('escape-string-regexp');
    username = username && escapeStringRegexp.default(username);
    return await collection.findOne({ twitterUsername: { $regex: new RegExp(`^${username}$`, 'i') } })
  },
  initSupply: async (address) => {
    await collection.updateOne(
      {
        _id: address,
        supply: { $exists: false }
      },
      {
        $set: { supply: 0, supplyBlock: 0 }
      }
    );
  }
});

const mongo = async (dbName = 'friends2', url = 'mongodb://localhost:27017', poolSize = 3) => {
  const client = new MongoClient(url, {
    maxPoolSize: poolSize
  });
  await client.connect();
  const db = client.db(dbName);
  return {
    collection: name => db.collection(name),
    close: () => null,
    users: users(db.collection('users')),
    transactions: transactions(db.collection('transactions')),
  };
}

module.exports = mongo;
