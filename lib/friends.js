const axios = require('axios');
const cache = require("./mongo");
const { parse } = require("twit/lib/parser");
const base = 'https://prod-api.kosetto.com/users/'

const getUser = async (address) => {
  const response = await axios.get(`${base}${address}`, {
    timeout: 1000
  });
  await cache.user.set({
    address: response.data.address,
    twitterName: response.data.twitterName,
    twitterUsername: response.data.twitterUsername,
    twitterPfpUrl: response.data.twitterPfpUrl,
  });
  return response.data;
}

const facadeGetUser = async (address) => {
  try {
    let user = await cache.user.get(address);
    if (!user) {
      user = await getUser(address);
    }
    return user;
  } catch (e) {
    return {
      address: address,
      twitterName: address.replace(/^(0x.{3}).*?(.{4})$/, '$1...$2'),
      twitterUsername: "",
      twitterPfpUrl: "",
    }
  }
}

const getHolders = async (address) => {
  const users = [];
  let pageStart = 0;
  let response;
  do {
    response = await axios.get(`${base}${address}/token/holders?pageStart=${pageStart}`);
    users.push(...response.data.users);
    pageStart = response.data.nextPageStart;
  } while (response.data.users.length < 10);
  users.forEach(user => {
    cache.user.set({
      address: user.address,
      twitterName: user.twitterName,
      twitterUsername: user.twitterUsername,
      twitterPfpUrl: user.twitterPfpUrl,
    });
  });
  return users;
}

const getHoldings = async (address) => {
  const users = [];
  let pageStart = 0;
  let response;
  do {
    response = await axios.get(`${base}${address}/token-holdings?pageStart=${pageStart}`);
    users.push(...response.data.users);
    pageStart = response.data.nextPageStart;
  } while (response.data.users.length === 10);

  return users.map(user => ({
    ...user,
    balance: parseInt(user.balance)
  }));
}

module.exports = {
  getUser,
  getHolders,
  getHoldings,
  facadeGetUser
}
