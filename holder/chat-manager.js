const chat = require('./chat');
const dbInstance = require('./db-instance');
const blacklistListener = require('./chat-listener-blacklist');
const dbListener = require('./chat-listener-db');
const botListener = require('./chat-listener-bot');
const relayListener = require('./chat-listener-relay');
const jwt = require('jsonwebtoken');
const { sleep } = require("../lib/utils");

let address,
  config,
  _running = false,
  _chat = null,
  notifyFrontendListener = null,
  _blacklistListener = null,
  _dbListener = null,
  _botListener = null,
  _relayListener = null
;

const isJwtValid = (token) => {
  try {
    const decoded = jwt.decode(token);
    return decoded && decoded.address && decoded.address.toLowerCase() === address.toLowerCase();
  } catch (e) {
    return false;
  }
}
const getJwt = () => {
  if (config && config.jwt && isJwtValid(config.jwt)) {
    return config.jwt;
  }
  return null;
}
const run = async () => {
  console.log('Chat manager started');
  const jwt = getJwt();
  if (!jwt) {
    if (_running) {
      await _chat.close();
      _running = false;
    }
    console.log('No JWT found, chat manager stopped');
    return;
  }
  if (!_running) {
    console.log('Chat listener started');
    _chat = chat(address, jwt);
    _running = true;
  }

  if (!_dbListener) {
    console.log('DB listener started')
    _dbListener = dbListener(await dbInstance.getDb(), address);
  }

  const listeners = [
    notifyFrontendListener,
    _dbListener.listener
  ];

  if (config && config.blacklist && config.blacklist.enabled && config.blacklist.list.length > 0) {
    if (!_blacklistListener) {
      _blacklistListener = blacklistListener(await dbInstance.getDb(), []);
    }
    _blacklistListener.setBlacklist(await dbInstance.userList(config.blacklist.list));
    listeners.push(_blacklistListener.listener);
    console.log('Blacklist listener started. Blacklisted addresses: ', config.blacklist.list)
  }

  if (config && config.bot && (config.bot?.help?.enabled || config.bot?.wall?.enabled || config.bot?.forward?.enabled)) {
    if (!_botListener) {
      _botListener = botListener(address, config.bot, _chat.sendMessage);
    }
    await _botListener.setConfig(config.bot, dbInstance.userList);
    listeners.push(_botListener.listener);
    console.log('Bot listener started.');
  }

  if (config && config.relay && config.relay.enabled && config.relay.message.length > 0) {
    if (!_relayListener) {
      _relayListener = relayListener(address, config.relay.message, _chat.sendMessage);
    }
    _relayListener.setMessage(config.relay.message);
    _relayListener.setBlacklist(config.relay?.blacklist ? await dbInstance.userList(config.relay.blacklist) : [])
    listeners.push(_relayListener.listener);
    console.log('Relay listener started. Message: ', config.relay.message, ' Blacklisted addresses: ', config.relay.blacklist);
  }

  console.log('Chat manager initialized');
  _chat.updateToken(jwt);
  _chat.setListeners(listeners);
  _chat.listen();
}

module.exports = (_address, _notifyFrontendListener) => {
  address = _address;
  notifyFrontendListener = _notifyFrontendListener;
  return {
    updateConfig: async (newConfig) => {
      config = newConfig;
      await run();
    },
    init: async (_config) => {
      config = _config;
      console.log('Config loaded: ', config);
      await run();
      console.log('Chat manager running');
    },
    sendMessage: async (message) => {
      if (_chat) {
        const result = await _chat.sendMessage(message);
        await sleep(1000);
        return result;
      } else {
        console.error('Chat not initialized');
        return false;
      }
    },
    broadcastMessage: async (message) => {
      if (!_chat) {
        console.error('Chat not initialized');
      }
      const holdings = await dbInstance.getHoldings(address);
      const hasPlaceholder = message.indexOf('%username%') !== -1;
      const messages = holdings.map(holding => ({
        chatRoomId: holding,
        text: message
      }));
      for (const message of messages) {
        if (message.chatRoomId === address) {
          continue;
        }
        if (hasPlaceholder) {
          const holder = await dbInstance.exec(async (db) => db.collection('users').findOne({ _id: message.chatRoomId }));
          message.text = `"${message.text}"`.replace(/%username%/g, holder?.twitterName || message.chatRoomId);
        }
        await _chat.sendMessage(message);
        await sleep(500);
      }
    }
  }
}
