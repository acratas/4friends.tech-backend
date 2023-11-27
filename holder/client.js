require('dotenv').config({
  path: '../.env'
});
const net = require('net');
const jwt = require("jsonwebtoken");
const dbInstance = require("./db-instance");
const client = new net.Socket();
const address = process.argv[2].toLowerCase();
const send = (method, payload) => {
  client.write(JSON.stringify({
    address: address,
    method: method,
    payload: payload
  }));
}

const notifyListener = async (message, next) => {
  setTimeout(() => {
    try {
      send('chatMessageReceived', message);
    } catch (error) {
      console.error(error);
    }
  }, 1000);
  await next();
}

const reconnectDelay = 5000;
const chatManager = require('./chat-manager')(address, notifyListener);
const transactionManager = require('./transaction-manager')(address, chatManager);
const historyManager = require('./history-manager');
const isJwtValid = (token) => {
  try {
    const decoded = jwt.decode(token);
    return decoded && decoded.address && decoded.address.toLowerCase() === address.toLowerCase();
  } catch (e) {
    return false;
  }
}
const getConfig = async () => await dbInstance.exec(async (db) => db.collection('chat-config').findOne({ _id: address }));
const setConfig = async (newConfig) => {
  if (newConfig.jwt) {
    if (!isJwtValid(newConfig.jwt)) {
      throw new Error({
        field: 'jwt',
        message: 'Invalid JWT'
      });
    }
  }
  await dbInstance.exec(async (db) => db.collection('chat-config').updateOne({ _id: address }, { $set: newConfig }, { upsert: true }));
}

const connectToServer = () => {
  client.connect(process.env.EXPRESS_SOCKET_PATH, async function () {
    console.log(`Connected to the Express server`);
    client.write(JSON.stringify({ address: address }));
    const config = await getConfig();
    console.log('Initializing chat manager...');
    await chatManager.init(config);
    console.log('Initializing transaction manager...');
    await transactionManager.init(config);
    if (config?.jwt) {
      console.log('Initializing history manager...');
      await historyManager.init(address, config.jwt);
    }
  });
}

function splitJsons(dataString) {
  const correctedString = dataString.replace(/}\s*{/g, '},{');

  const jsonArrayString = `[${correctedString}]`;

  try {
    const jsonArray = JSON.parse(jsonArrayString);
    return jsonArray;
  } catch (error) {
    console.error('Failed to parse JSON', error);
    return null;
  }
}


client.on('data', async function (data) {

  data = splitJsons(data.toString());

  for (const json of data) {

    console.log('Received: ', JSON.stringify(json));

    const { address, method, payload } = json;
    let _method = null, _payload = null;

    switch (method) {
      case 'init':
        await chatManager.init(await getConfig());
        break;
      case 'chatUpdateConfig':
        try {
          const tokenChanged = payload.jwt && payload.jwt !== (await getConfig())?.jwt;
          await setConfig(payload);
          await chatManager.updateConfig(payload);
          await transactionManager.updateConfig(payload);
          if (tokenChanged) {
            await historyManager.init(address, payload.jwt);
          }
          _method = 'chatUpdateConfigSuccess';
          _payload = await getConfig();
        } catch (e) {
          _method = 'chatUpdateConfigError';
          _payload = e;
          console.error(e)
        }
        break;
      case 'chatGetConfig':
        _method = 'chatGetConfigSuccess';
        _payload = await getConfig();
        break;
      case 'chatBroadcastMessage':
        const { message } = payload;
        await chatManager.broadcastMessage(message);
        _method = 'chatBroadcastMessageSuccess';
        _payload = { message };
        break;
      case 'chatSetMessage':
        const { messages } = payload;
        let sent = 0;
        for (let message of messages) {
          sent += await chatManager.sendMessage(message) ? 1 : 0;
        }
        _method = sent === messages.length ? 'chatSetMessageSuccess' : 'chatSetMessageWarning';
        _payload = {
          sent,
          total: messages.length
        };
        break;
      case 'wallGetMessages':
        _method = 'wallGetMessagesSuccess';
        _payload = {
          params: payload,
          messages: await historyManager.getMessages(address, payload)
        };
        break;

    }

    if (_method === null) {
      return;
    }

    send(_method, _payload || {});

  }

});

client.on('close', function () {
  console.log('Connection closed');
  setTimeout(connectToServer, reconnectDelay);
});


connectToServer();
