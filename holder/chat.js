const WebSocket = require('ws');
const axios = require('axios');

const generateClientMessageId = (length = 11) => {
  const maxChars = 256;
  let randomChars = "";
  let availableChars = [];
  for (let i = 0; i < maxChars; i++) {
    availableChars[i] = (i + maxChars).toString(16).substring(1);
  }
  if (!randomChars || maxChars + length > 512) {
    for (let i = 0; i < maxChars; i++) {
      randomChars += availableChars[Math.floor(Math.random() * maxChars)];
    }
  }
  return randomChars.substring(0, length);
}

let ws = null;
let pingInterval = null;
let address = null;
let token = null;
const urlPrefix = `wss://prod-api.kosetto.com/?authorization=`
let listeners = [];
let listening = false;

const runListeners = async (listeners, message, index = 0) => {
  if (index >= listeners.length) {
    return;
  }
  const listener = listeners[index];
  const next = async (modifiedMessage) => {
    await runListeners(listeners, modifiedMessage || message, index + 1);
  };
  await listener(message, next);
}

const onOpen = () => {
  console.log('Connected...');
  listening = true;
  pingInterval ? clearInterval(pingInterval) : null;
  pingInterval = setInterval(() => {
    ws.send(JSON.stringify({ action: 'ping' }));
    console.debug('Sent ping to server');
  }, 20000);
}
const onClose = (code, reason) => {
  console.error(`Disconnected with code: ${code} and reason: ${reason}`);
  listening = false;
  clearInterval(pingInterval);
  pingInterval = setInterval(() => {
    console.log('Reconnecting...');
    listen(process.env.URL);
  }, 2000);
}

const onMessage = async (data) => {
  data = data.toString();
  const message = JSON.parse(data);
  if (message == '1' || message.type === 'pong') {
    return;
  }
  console.debug(`Received data: ${data}`);
  if (message.type === 'receivedMessage') {
    await runListeners(listeners, message);
  }
}

const listen = (url, headers = {}) => {
  ws = new WebSocket(url, { headers });
  ws.on('open', onOpen);
  ws.on('close', onClose);
  ws.on('message', onMessage);
}

module.exports = (_address, _token, _listeners = []) => {
  address = _address;
  token = _token;
  listeners = _listeners;
  return {
    updateToken: (_token) => {
      if (_token === token) {
        return;
      }
      token = _token;
      ws?.close();
      listen(`${urlPrefix}${token}`);
    },
    listen: () => !listening && listen(`${urlPrefix}${token}`),
    close: () => ws?.close(),
    sendMessage: async (message) => {
      console.log('Sending message...', message);
      try {
        await axios.post('https://prod-api.kosetto.com/messages/' + message.chatRoomId, {
          clientMessageId: generateClientMessageId(),
          imagePaths: [],
          ...message,
        }, {
          headers: {
            'Authorization': token,
          }
        })
        return true;
      } catch (e) {
        console.error(e.toJSON());
        return false;
      }
    },
    setListeners: (_listeners) => {
      listeners = _listeners;
    }
  }
}
