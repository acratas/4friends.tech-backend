require('dotenv').config({
  path: `${__dirname}/../.env`
});

const net = require('net');

const whaleAlert = (transaction) => {
  const client = new net.Socket();
  client.connect(process.env.WHALE_ALERT_SOCKET_PORT, 'localhost', () => {
    client.write(JSON.stringify(transaction));
    client.end();
  });
}
module.exports = {
  whaleAlert
}
