const FriendTech = require('./lib/FriendTech');
const BN = require("bn.js");
const Web3 = require("web3");
const fs = require("fs");
const web3 = new Web3();
const format = (value) => web3.utils.fromWei(value.sub(value.mod(new BN('10000000000000', 10))).toString(), 'ether')
const friendTach = new FriendTech();
const data  = [];
for (let x = 0; x <= 10000; x++) {
  data[x] = parseFloat(format(friendTach.getSellPriceAfterFee(x, 1)));
}
//write data to file.json
fs.writeFileSync('data/sell.prices2.json', JSON.stringify(data, null, 2), 'utf-8');
