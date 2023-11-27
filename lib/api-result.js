const { getUser, getHoldings, facadeGetUser } = require("./friends");
const { getTwitterUser } = require("./twitter");
const { getBalance, getTransactions, getFriendValue, getInternalTransactions } = require("./blockscout");
const BN = require("bn.js");
const { mainUser } = require("./mongo");
const Web3 = require("web3");

const getResult = async (address) => {

  const result = (await mainUser.get(address)) || {
    address: address,
    user: {
      portfolioValue: "0",
      totalBuyValue: "0",
      totalSellValue: "0",
      gasFees: "0",
      tradingFeesEarned: "0",
      roi: "0"
    },
    portfolio: [],
    transactions: [],
  };

  let transactions = await getTransactions(address, result.transactions.length ? result.transactions[0].block : 0);

  if (Object.keys(transactions).length === 0) {
    return result.user.address ? result : {
      user: null,
      portfolio: [],
      transactions: [],
      'error': 'User not found'
    };
  }

  const [user, internalTransactions, balance] = await Promise.all([
    getUser(address),
    getInternalTransactions(address, result.transactions.length ? result.transactions[0].block : 0),
    getBalance(address)
  ]);

  const twitterUser = await getTwitterUser(user.twitterUserId);

  result.user = {
    ...result.user,
    address: user.address,
    twitterName: user.twitterName,
    twitterUsername: user.twitterUsername,
    twitterPfpUrl: user.twitterPfpUrl,
    displayPrice: user.displayPrice,
    holderCount: user.holderCount,
    holdingCount: user.holdingCount,
    shareSupply: user.shareSupply,
    watchlistCount: user.watchlistCount,
    twitterFollowers: user.followers_count,
    twitterFriendsCount: user.twitterFriendsCount,
    twitterVerified: user.twitterVerified,
    twitterFavoritesCount: user.twitterFavoritesCount,
    twitterStatusesCount: user.twitterStatusesCount,
    twitterCreatedAt: user.twitterCreatedAt,
    points: user.points,
    leaderboard: user.leaderboard,
    tier: user.tier,

    balance: balance,
  }

  result.user.totalBuyValue = new BN(result.user.totalBuyValue);
  result.user.totalSellValue = new BN(result.user.totalSellValue);
  result.user.gasFees = new BN(result.user.gasFees);
  result.user.tradingFeesEarned = new BN(result.user.tradingFeesEarned);

  const portfolio = {}
  transactions = (await Promise.all(
    Object
      .values(transactions)
      .map(async tx => {
        const user = await facadeGetUser(tx.address);
        const value = tx.isBuy ? tx.value : internalTransactions[tx.hash].value;
        delete internalTransactions[tx.hash];

        result.user.totalBuyValue.iadd(new BN(tx.isBuy ? value : 0));
        result.user.totalSellValue.iadd(new BN(tx.isBuy ? 0 : value));
        result.user.gasFees.iadd(new BN(tx.gasFee));

        if (!portfolio[tx.address]) {
          portfolio[tx.address] = {
            ...user,
            balance: 0,
          }
        }
        portfolio[tx.address].balance += tx.isBuy ? tx.amount : -tx.amount;

        return {
          ...tx,
          value,
          ...user
        }
      })
  ));

  result.portfolio = Object.values(portfolio).filter(holding => holding.balance > 0).sort((a, b) => b.balance - a.balance);
  console.log(portfolio);

  transactions.forEach(tx => console.log(
    `${tx.isBuy ? 'Buy' : 'Sell'} ${tx.amount}X ${tx.twitterName} for ${Web3.utils.fromWei(tx.value)} ETH at ${tx.hash} ${tx.timestamp}`
  ));


  Object.values(internalTransactions).forEach(tx => result.user.tradingFeesEarned.iadd(new BN(tx.value)));

  result.transactions.unshift(...transactions);

  result.user.roi = result.user.totalSellValue
    .add(result.user.tradingFeesEarned)
    .add(result.user.totalBuyValue)
    .add(result.user.gasFees)
    .toString();
  result.user.totalBuyValue = result.user.totalBuyValue.toString();
  result.user.totalSellValue = result.user.totalSellValue.toString();
  result.user.gasFees = result.user.gasFees.toString();
  result.user.tradingFeesEarned = result.user.tradingFeesEarned.toString();


  console.log(
    `Total Buy Value: ${Web3.utils.fromWei(result.user.totalBuyValue)} ETH\n` +
    `Total Sell Value: ${Web3.utils.fromWei(result.user.totalSellValue)} ETH\n` +
    `Gas Fees: ${Web3.utils.fromWei(result.user.gasFees)} ETH\n` +
    `Trading Fees Earned: ${Web3.utils.fromWei(result.user.tradingFeesEarned)} ETH\n`
  )

  await mainUser.set(result);

  return result;

}

module.exports = {
  getResult
};
