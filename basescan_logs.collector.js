require('dotenv').config();
const { sleep } = require("./lib/utils");
const mongo = require('./lib/mongo');
const axios = require("axios");
const BN = require("bn.js");
const path = require("path");
const { MongoNetworkError } = require("mongodb");


const formatTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  const milliseconds = String(date.getUTCMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}000Z`;
}


const get = async (fromBlock, page = 1, offset = 1000) => {
  const url = `${process.env.BASESCAN_URL}?module=logs&action=getLogs&address=${process.env.CONTRACT_ADDRESS}&offset=${offset}&page=${page}&fromBlock=${fromBlock}`;
  console.log(new Date(), `[GET] ${url.toString()}`);
  const response = await axios.get(url.toString());
  return response.data;
}

const run = async (db) => {
  const id = path.basename(__filename);
  let data;
  do {

    let config = await db.collection('config').findOne({ _id: id }) || { fromBlock: 1 };
    const fromBlock = config.fromBlock;
    data = await get(config.fromBlock);

    for (let log of data.result) {
      if (log.data.length != 514) continue;
      const cleanData = log.data.substring(2);
      const segments = [];
      for (let i = 0; i < cleanData.length; i += 64) {
        segments.push(cleanData.substring(i, i + 64));
      }
      const event = {
        transactionHash: log.transactionHash,
        blockNumber: parseInt(log.blockNumber, 16),
        transactionIndex: parseInt(log.transactionIndex, 16),
        timestamp: formatTimestamp(parseInt(log.timeStamp, 16) * 1000),
        returnValues: {
          trader: '0x' + segments[0].slice(-40),
          subject: '0x' + segments[1].slice(-40),
          isBuy: parseInt(segments[2], 16) !== 0,
          shareAmount: (new BN(segments[3], 16)).toNumber(),
          ethAmount: (new BN(segments[4], 16)).toString(),
          protocolEthAmount: (new BN(segments[5], 16)).toString(),
          subjectEthAmount: (new BN(segments[6], 16)).toString(),
          supply: (new BN(segments[7], 16)).toNumber(),
        }
      };
      try {
        await db.users.setFromEvent(event);
      } catch (e) {
        console.error(e);
      }
      try {
        await db.transactions.setFromEvent(event);
      } catch (e) {
        console.error(e);
      }
      config.fromBlock = event.blockNumber;
    }
    await db.collection('config').updateOne({ _id: id }, { $set: config }, { upsert: true });
    if (fromBlock == config.fromBlock) {
      await sleep(1000 * 15);
    }
  } while (data.result.length > 0);
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
