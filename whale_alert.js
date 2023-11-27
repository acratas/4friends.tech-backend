require('dotenv').config();
const mongo = require('./lib/mongo');
const Web3 = require("web3");
const BN = require('bn.js');
const web3 = new Web3();
const net = require('net');
const axios = require('axios');
const { roundToDecimal } = require("./lib/utils");
const { MongoNetworkError } = require("mongodb");
const TwitterApi = require('twitter-api-v2').TwitterApi;
const buyPriceData = require('./data/prices2.json');

const client = new TwitterApi({
  appKey: process.env.TWITTER_API2_APP_KEY,
  appSecret: process.env.TWITTER_API2_APP_SECRET,
  accessToken: process.env.TWITTER_API2_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_API2_ACCESS_SECRET,
});

const token = process.env.TELEGRAM_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;


const postTelegramMessage = async (message) => {
  await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML'
  });
}

function postTweet(message) {
  T.post('statuses/update', { status: message }, function (err, data, response) {
    if (err) {
      console.error('Publishing error', err);
    } else {
      console.log('Published', message);
    }
  });
}


let cachedEthPrice = null;
let lastFetchedTimestamp = null;

const getEthPrice = async () => {
  const now = Date.now();

  if (cachedEthPrice !== null && lastFetchedTimestamp && now - lastFetchedTimestamp < 5 * 60 * 1000) {
    return cachedEthPrice;
  }

  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    cachedEthPrice = response.data.ethereum.usd;
    lastFetchedTimestamp = now;
    return cachedEthPrice;
  } catch (error) {
    console.error(error);
    if (cachedEthPrice !== null) {
      return cachedEthPrice;
    } else {
      throw error;
    }
  }
}

const getUser = async (address) => {
  console.log(new Date(), `[GET] https://prod-api.kosetto.com/users/${address}`);
  const response = await axios.get(`https://prod-api.kosetto.com/users/${address}`, {
    timeout: 1000
  });
  return response.data;
}

const isTimestampInMilliseconds = (timestamp) => {
  const currentTime = Date.now();

  const fiftyYearsInMilliseconds = 50 * 365.25 * 24 * 60 * 60 * 1000;

  if (timestamp > (currentTime - fiftyYearsInMilliseconds) && timestamp <= currentTime) {
    return true;
  }

  const fiftyYearsInSeconds = 50 * 365.25 * 24 * 60 * 60;

  if (timestamp > (currentTime / 1000 - fiftyYearsInSeconds) && timestamp <= currentTime / 1000) {
    return false;
  }

  throw new Error('Timestamp is out of the expected range.');
};

const format = (value) => web3.utils.fromWei(value.sub(value.mod(new BN('10000000000000', 10))).toString(), 'ether')

const createTelegramMessage = (username, isBuy, quantity, keyOwner, ethPrice, usdPrice, tx, trader, subject) => {
  let actionWord = isBuy ? 'bought' : 'sold';
  let keyOwnerWord = keyOwner;
  let emoji = '';

  if (username === keyOwner) {
    actionWord = isBuy ? 'bought' : 'dumped';
    keyOwnerWord = 'own';
  }

  switch (actionWord) {
    case 'bought':
      emoji = '🛍️';
      break;
    case 'sold':
      emoji = '💰';
      break;
    case 'dumped':
      emoji = '🗑️';
      break;
  }

  let msg = `${emoji} <b>${username}</b> ${actionWord} ${quantity} <b>${keyOwnerWord}</b> FT ${"🔑".repeat(quantity)} for <b>Ξ${roundToDecimal(ethPrice, 5)}</b> ($${roundToDecimal(usdPrice, 2)}).\n`;
  if (trader.twitterName || subject.twitterName) {
    msg += `------------------------\n`;
  }
  if (trader.twitterName) {
    msg += `Trader: <a href="https://4friends.tech/${trader.address || trader.twitterUsername}">${trader.twitterName}</a> | Key price: ${buyPriceData[trader.shareSupply]} | <a href="https://friend.tech/${trader.twitterUsername}?${tx}">[FT]</a> | <a href="https://twitter.com/${trader.twitterUsername}">[X]</a>\n`
  }
  if (subject.twitterName) {
    msg += `Subject: <a href="https://4friends.tech/${subject.address || subject.twitterUsername}">${subject.twitterName}</a> | Key price: ${buyPriceData[subject.shareSupply]} | <a href="https://friend.tech/${subject.twitterUsername}?${tx}">[FT]</a> | <a href="https://twitter.com/${subject.twitterUsername}">[X]</a>\n`;
  }
  return msg;
}

const createMessage = (username, isBuy, quantity, keyOwner, ethPrice, usdPrice, tx) => {
  let actionWord = isBuy ? 'bought' : 'sold';
  let keyOwnerWord = keyOwner;
  let emoji = '';

  if (username === keyOwner) {
    actionWord = isBuy ? 'bought' : 'dumped';
    keyOwnerWord = 'own';
  }

  switch (actionWord) {
    case 'bought':
      emoji = '🛍️';
      break;
    case 'sold':
      emoji = '💰';
      break;
    case 'dumped':
      emoji = '🗑️';
      break;
  }

  return `🚨 FT Whale Alert! 🚨\n${username} ${emoji} ${actionWord} ${quantity} ${keyOwnerWord} FT ${"🔑".repeat(quantity)} for Ξ${roundToDecimal(ethPrice, 5)} ($${roundToDecimal(usdPrice, 2)}).\nSee:\nhttps://basescan.org/tx/${tx}\n`;
}

const MIN_ETH = 2.5;

let notifiedTransactions = [];

let db = null;
const onTransaction = async (transaction) => {
  try {

    if (db === null) {
      db = await mongo(process.env.MONGO_DB, process.env.MONGO_URL);
    }

    if (notifiedTransactions.includes(transaction.tx_hash)) {
      return;
    }

    notifiedTransactions.push(transaction.tx_hash);

    const value = new BN(transaction.value);
    const ethValue = web3.utils.fromWei(value.sub(value.mod(new BN('10000000000000', 10))).toString(), 'ether');


    if (parseFloat(ethValue) < MIN_ETH) {
      console.log('alert', transaction.tx_hash, 'skipped', ethValue, '<', MIN_ETH);
      return;
    }

    let timestamp = transaction.timestamp;
    if (timestamp instanceof Date) {
      timestamp = timestamp.getTime();
    } else if (typeof timestamp === 'string') {
      timestamp = (new Date(timestamp)).getTime();
    }
    if (!isTimestampInMilliseconds(timestamp)) {
      timestamp = timestamp * 1000;
    }
    const timeDelta = Math.floor((Date.now() - timestamp) / 1000);

    if (timeDelta > 120) {
      console.warn('alert', transaction.tx_hash, 'skipped', timeDelta, 'seconds ago');
      return;
    }

    let trader, subject = null;

    (await db
        .collection('users')
        .find({
          _id: {
            $in: [transaction.trader, transaction.subject]
          }
        })
        .toArray()
    ).forEach((user) => {
      if (user._id === transaction.trader) {
        trader = user;
      }
      if (user._id === transaction.subject) {
        subject = user;
      }
    });

    let x;

    try {
      x = await getUser(transaction.trader);
      trader = x;
    } catch (error) {
      console.error('Get user error', transaction.trader, error);
    }


    try {
      x = await getUser(transaction.subject);
      subject = x;
    } catch (error) {
      console.error('Get user error', transaction.subject, error);
    }


    const message = createMessage(
      trader ? `[${trader.twitterName}]` : `🤖${transaction.trader}🤖`,
      transaction.isBuy,
      transaction.amount,
      subject ? `[${subject.twitterName}]` : `🤖${transaction.subject}🤖`,
      ethValue,
      parseFloat(ethValue) * await getEthPrice(),
      transaction.tx_hash
    );

    console.log(message);

    if (message.match(/@undefined/)) {
      console.log('Message contains undefined user',
        trader, subject,
        transaction.trader, transaction.subject);
      return;
    }

    try {
      const twitterMessage = message.replace(/See:/g, `#friendtech #4friends\n\nSee:`);
      await client.v2.tweet(twitterMessage);
      console.log('Tweet sent');
    } catch (error) {
      console.error('Error while sending tweet', error);
    }

    try {
      await postTelegramMessage(
        createTelegramMessage(
          trader ? `[${trader.twitterName}]` : `🤖${transaction.trader}🤖`,
          transaction.isBuy,
          transaction.amount,
          subject ? `[${subject.twitterName}]` : `🤖${transaction.subject}🤖`,
          ethValue,
          parseFloat(ethValue) * await getEthPrice(),
          transaction.tx_hash,
          trader,
          subject
        )
      );
      console.log('Telegram message sent');
    } catch (error) {
      console.error('Error while sending telegram message', error);
    }
  } catch (error) {
    if (error instanceof MongoNetworkError) {
      console.error("Connection error");
      process.exit(1);
    }
  }
}

const server = net.createServer((socket) => {
  socket.on('data', async (data) => {
    const transaction = JSON.parse(data.toString());
    if (!transaction.subject) {
      console.log('Transaction without subject', transaction);
    }
    await onTransaction(transaction);
  });
});

server.listen(process.env.WHALE_ALERT_SOCKET_PORT, 'localhost', () => {
  console.log(`Server listening on port ${process.env.WHALE_ALERT_SOCKET_PORT}`);
});
