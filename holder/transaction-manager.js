const dbInstance = require('./db-instance');
const { sleep } = require("../lib/utils");

let chatManager = null,
  address = null,
  config = null,
  interval = null
;


const runHolders = async (message) => {
  let holders = await dbInstance.exec(async (db) => db.collection('transactions').find({
    subject: address,
    trader: { $ne: address },
  }).toArray());

  holders = holders.reduce((acc, transaction) => {
    if (!acc[transaction.trader]) {
      acc[transaction.trader] = [];
    }
    acc[transaction.trader].push(transaction);
    return acc;
  }, {});

  holders = Object.keys(holders)
    .reduce((acc, trader) => {
      if (holders[trader].length === 1 && !holders[trader][0]?.holderNotified) {
        acc.push(holders[trader][0]);
      }
      return acc;
    } , []);

  for (let transaction of holders) {
    if (transaction.holderNotified) {
      continue;
    }
    const holder = await dbInstance.exec(async (db) => db.collection('users').findOne({ _id: transaction.trader }));
    const text = `${message}`.replace(/%username%/g, holder?.twitterName || transaction.trader);
    await chatManager.sendMessage({
      chatRoomId: address,
      text
    });
    await dbInstance.exec(async (db) => db.collection('transactions').updateOne({_id: transaction._id}, { $set: { holderNotified: true } }));
    await sleep(300);
  }

}

const runHoldings = async (message) => {
  let holdings = await dbInstance.exec(async (db) => db.collection('transactions').find({
    subject: { $ne: address },
    trader: address,
  }).toArray());

  holdings = holdings.reduce((acc, transaction) => {
    if (!acc[transaction.subject]) {
      acc[transaction.subject] = [];
    }
    acc[transaction.subject].push(transaction);
    return acc;
  });

  holdings = Object.keys(holdings)
    .reduce((acc, subject) => {
      if (holdings[subject].length === 1 && !holdings[subject][0]?.holdingNotified) {
        acc.push(holdings[subject][0]);
      }
      return acc;
    }, []);

  for (let transaction of holdings) {
    if (transaction.holdingNotified) {
      continue;
    }
    const holding = await dbInstance.exec(async (db) => db.collection('users').findOne({ _id: transaction.subject }));
    const text = `${message}`.replace(/%username%/g, holding?.twitterName || transaction.subject);
    await chatManager.sendMessage({
      chatRoomId: transaction.subject,
      text
    });
    await dbInstance.exec(async (db) => db.collection('transactions').updateOne({_id: transaction._id}, { $set: {
        holdingNotified: true
      } }));
    await sleep(300);
  }


}

const run = async (holdersMessage, holdingsMessage) => {
  if (holdersMessage) {
    await runHolders(holdersMessage);
  }
  if (holdingsMessage) {
    await runHoldings(holdingsMessage);
  }
}

const updateConfig = async (_config = null) => {
  config = _config || (await dbInstance.exec(async (db) => db.collection('chat-config').findOne({ _id: address })));
  if (interval) {
    clearInterval(interval);
  }
  if (config && (
    (config.holder?.enabled && config.holder?.message?.length > 0) ||
    (config.holding?.enabled && config.holding?.message?.length > 0)
  )) {
    console.log('Transaction manager enabled', {
      holder: config.holder?.enabled && config.holder?.message?.length > 0,
      holding: config.holding?.enabled && config.holding?.message?.length > 0
    })
    interval = setInterval(async () => {
      await run(
        config?.holder?.enabled && config?.holder?.message.length > 0 ? config.holder.message : null,
        config?.holding?.enabled && config?.holding?.message.length > 0 ? config.holding.message : null
      );
    }, 60000);
  }
}

module.exports = (_address, _chatManager) => {
  chatManager = _chatManager;
  address = _address;
  return {
    updateConfig,
    init: updateConfig
  }
}
