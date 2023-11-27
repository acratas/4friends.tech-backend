const axios = require('axios');
const { facadeGetUser } = require("./friends");

const apiKey = process.env.BASESCAN_API_KEY;
const contractAddress = process.env.CONTRACT_ADDRESS;
const firstBlock = 2430440;

const getTransactions = async (address, page = 1, startBlock) => {
  const response = await axios.get(`https://api.basescan.org/api?module=account&action=txlist&address=${address}&startblock=${startBlock}&sort=asc&apikey=${apiKey}&offset=100&page=1`);
  console.log(`https://api.basescan.org/api?module=account&action=txlist&address=${address}&startblock=${startBlock}&sort=asc&apikey=${apiKey}&offset=100&page=1`)
  return response.data.result;
}

const getInternalTransactions = async (address, page = 1, startBlock) => {
  const response = await axios.get(`https://api.basescan.org/api?module=account&action=txlistinternal&address=${address}&startblock=${startBlock}&sort=asc&apikey=${apiKey}&offset=100&page=1`);
  console.log(`https://api.basescan.org/api?module=account&action=txlistinternal&address=${address}&startblock=${startBlock}&sort=asc&apikey=${apiKey}&offset=100&page=1`);
  return response.data.result;
}

const getUserTransactions = async (userAddress, startBlock = 0) => {
  startBlock = startBlock < firstBlock ? firstBlock : startBlock;
  const userTransactions = [];
  const internalTransactions = await getUserInternalTransactions(userAddress);
  let page = 1;
  while (true) {
    const newTransactions = await getTransactions(userAddress, page, startBlock);
    const newContractTransactions = newTransactions
      .filter(transaction => transaction.to === contractAddress && transaction.isError === '0')
      .map(transaction => {
        const input = transaction.input;
        const methodId = input.slice(0, 10);
        const address = "0x" + input.slice(34, 74);
        const amountHex = input.slice(74);
        const amount = parseInt(amountHex, 16);
        const isBuy = methodId === '0x6945b123';
        return {
          ...facadeGetUser(address),
          isBuy,
          amount,
          date: transaction.timeStamp,
          value: isBuy ? `-${transaction.value}` : internalTransactions[transaction.hash].value,
        }
      });
    userTransactions.push(...newContractTransactions);
    if (newTransactions.length < 10000) {
      break;
    }
    page++;
  }
  return userTransactions;
}

const getUserInternalTransactions = async (userAddress, startBlock = 0) => {
  startBlock = startBlock < firstBlock ? firstBlock : startBlock;
  const internalTransactions = {};
  let page = 1;
  while (true) {
    const newTransactions = await getInternalTransactions(userAddress, page, startBlock);
    console.warn(newTransactions)
    const newContractTransactions = newTransactions.filter(transaction => transaction.from === contractAddress && transaction.isError === '0');
    for(const transaction of newContractTransactions) {
      internalTransactions[transaction.hash] = transaction;
    }
    if (newTransactions.length < 10000) {
      break;
    }
    page++;
  }
  return internalTransactions;
}

const getUserBalance = async (userAddress) => {
  const response = await axios.get(`https://api.etherscan.io/api?module=account&action=balance&address=${userAddress}&tag=latest&apikey=${apiKey}`);
  return response.data.result;
}

module.exports = {
  getUserTransactions,
  getUserInternalTransactions,
  getUserBalance
}
