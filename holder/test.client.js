require('dotenv').config({
  path: '../.env'
});
const net = require('net');
const client = new net.Socket();

const address = process.argv[2];

const send = (address, method, payload) => {
  client.write(JSON.stringify({
    address: address,
    method: method,
    payload: payload
  }));
}

client.connect(process.env.EXPRESS_SOCKET_PATH, function() {
  console.log(`Connected to the Express server`);
  client.write(JSON.stringify({ address: address }));
});

client.on('data', function(data) {

  const {address, method, payload} = JSON.parse(data.toString());

  switch (method) {
    case 'init':
      break;
    case 'chatSetConfig':
      break;
    case 'chatGetConfig':
      break;
    case 'chatSetMessage':
      break;
  }

  console.log(message);
  client.write(JSON.stringify({
    address: address,
    payload: {
      'ping': 'pong'
    }
  }));
});
client.on('close', function() {
  console.log('Connection closed');
});
