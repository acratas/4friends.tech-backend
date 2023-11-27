const fs = require('fs');
const path = require('path');
const BN = require("bn.js");
const FriendTech = require('./FriendTech');
const Web3 = require("web3");

const getUser = async (db, address) => {
  address = address.toLowerCase();
  const user = await db.collection('users').findOne({ _id: address });
  const transactions = await db.collection('transactions')
    .aggregate([
      {
        $match: {
          $or: [
            { trader: address },
            { subject: address }
          ]
        }
      },
      {
        $sort: {
          timestamp: -1
        }
      },
      {
        $addFields: {
          lookupField: {
            $cond: [
              { $eq: ["$trader", address] },
              "subject",
              "trader"
            ]
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          let: { lookupValue: { $cond: [ { $eq: ["$trader", address] }, "$subject", "$trader" ] } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$_id", "$$lookupValue"]
                }
              }
            }
          ],
          as: 'user'
        }
      },
      {
        $unwind: {
          path: '$user',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          lookupField: 0
        }
      }
    ])
    .toArray();
  const holders = await db.collection('transactions')
    .aggregate([
      { $match: { subject: address } },
      { $sort: { timestamp: -1 } },
      {
        $lookup: {
          from: 'users',
          localField: 'trader',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
    ])
    .toArray();
  return {
    user,
    transactions,
    holders
  }

  const result = {
    user: await db.collection('users').findOne({ _id: address }),
    transactions: await db.collection('transactions')
      .aggregate([
        {
          $match: {
            $or: [
              { trader: address },
              { subject: address }
            ]
          }
        },
        {
          $sort: {
            timestamp: -1
          }
        },
        {
          $addFields: {
            lookupField: {
              $cond: [
                { $eq: ["$trader", address] },
                "subject",
                "trader"
              ]
            }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '$lookupField',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $unwind: '$user',
          preserveNullAndEmptyArrays: true
        },
        {
          $project: {
            lookupField: 0
          }
        }
      ])
      .toArray(),
    holders: await db.collection('transactions')
      .aggregate([
        {
          $match: {
            subject: address
          }
        },
        {
          $sort: {
            timestamp: -1
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'trader',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $unwind: '$user'
        },
      ])
      .toArray(),
  }
  await db.close();
  return result;
}

const getUserForImage = async (db, address) => {
  const { user, transactions, holders } = await getUser(db, address);
  if (!user) return null;

  user.totalBuyValue = new BN(0);
  user.totalSellValue = new BN(0);
  user.gasFees = new BN(0);
  user.portfolioValue = new BN(0);
  user.holdingCount = {
    users: 0,
    keys: 0,
  };
  user.tradingFeesEarned = new BN(0);

  const portfolio = {};
  const friendTech = new FriendTech();

  transactions.forEach((t) => {
    if (!(t.subject in portfolio)) {
      portfolio[t.subject] = {
        supply: t.user.supply,
        balance: 0,
        value: new BN(0),
      };
    }
    const value = t.isBuy ?
      (new BN("0").sub(new BN(t.value)).sub(new BN(t.subjectFee)).sub(new BN(t.protocolFee))) :
      new BN(t.value).sub(new BN(t.subjectFee)).sub(new BN(t.protocolFee))
    portfolio[t.subject].balance = t.isBuy ?
      portfolio[t.subject].balance + t.amount :
      portfolio[t.subject].balance - t.amount;
    user.totalBuyValue = user.totalBuyValue.add(t.isBuy ? value : new BN(0));
    user.totalSellValue = user.totalSellValue.add(t.isBuy ? new BN(0) : value);
    user.gasFees = user.gasFees.sub(new BN(t.fee || 0));
  })

  Object.values(portfolio)
    .filter(p => p.balance > 0)
    .forEach(p => {
      const value = friendTech.getSellPriceAfterFee(p.supply, p.balance);
      user.portfolioValue = user.portfolioValue.add(value);
      user.holdingCount.users++;
      user.holdingCount.keys += p.balance;
    });

  holders
    .forEach(h => {
      user.tradingFeesEarned = user.tradingFeesEarned.add(new BN(h.subjectFee));
    });

  const web3 = new Web3();

  let ethPrice = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
  ethPrice = await ethPrice.json();
  ethPrice = ethPrice.ethereum.usd;

  const format = (value) => web3.utils.fromWei(value.sub(value.mod(new BN('10000000000000', 10))).toString(), 'ether')
  const usdPrice = (ethValue, ethPrice) => (parseFloat(ethValue) * ethPrice).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD'
  });

  return {
    ...user,
    address,
    totalBuyValue: format(user.totalBuyValue) + ' ETH',
    totalBuyValueUsd: usdPrice(format(user.totalBuyValue), ethPrice),
    totalSellValue: format(user.totalSellValue) + ' ETH',
    totalSellValueUsd: usdPrice(format(user.totalSellValue), ethPrice),
    gasFees: format(user.gasFees) + ' ETH',
    gasFeesUsd: usdPrice(format(user.gasFees), ethPrice),
    portfolioValue: format(user.portfolioValue) + ' ETH',
    portfolioValueUsd: usdPrice(format(user.portfolioValue), ethPrice),
    tradingFeesEarned: format(user.tradingFeesEarned) + ' ETH',
    tradingFeesEarnedUsd: usdPrice(format(user.tradingFeesEarned), ethPrice),
  };
}

const getAddressByTwitter = async (db, twitterUserName) => {
  const user = await db.users.getByTwitterUsername(twitterUserName);
  return user?._id;
}

const getAutocomplete = async (db, query) => {
  const result = await db.users.autocomplete(query);
  return result;
}

const getHolders = async (db, address) => {
  const user = await getUser(db, address);
  const holders = user.holders.reduce((acc, h) => {
    if (!acc[h.trader]) {
      acc[h.trader] = {
        address: h.trader,
        balance: 0,
      }
    }
    acc[h.trader].balance += h.isBuy ? h.amount : -h.amount;
    return acc;
  }, {});
  return Object.values(holders).filter((p) => p.balance > 0).map(p => p.address);
}

module.exports = {
  getUser,
  getUserForImage,
  getAutocomplete,
  getAddressByTwitter,
  getHolders
}
