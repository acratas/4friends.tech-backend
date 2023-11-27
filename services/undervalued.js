const supplyData = require('../data/prices.json');
const buyPriceData = require('../data/prices2.json');

const DEFAULT_NUMBER_VALUE = 0;

const ALLOWED_SORT_FIELDS = {
  'supply': 'supply',
  'price': 'supply',
  'twitterFollowers': 'followers_count',
  'selfHoldings': 'selfHoldings',
  'watchlistCount': 'watchlistCount',
  'twitterFriendsCount': 'twitterFriendsCount',
  'twitterFavoritesCount': 'twitterFavoritesCount',
  'twitterStatusesCount': 'twitterStatusesCount',
  'twitterCreatedAt': 'twitterCreatedAt',
  'holdingCount': 'holdingCount',
  'holderCount': 'holderCount',
  'lastMessageTime': 'lastMessageTime',
  'walletBalance': 'walletBalance',
  'points': 'points',
  'leaderboard': 'leaderboard',
}


const getSortField = (sortField) => {
  return ALLOWED_SORT_FIELDS[sortField] || false;
}

const getFloatValue = (value) => {
  value = parseFloat(value);
  if (value > 0) {
    return value;
  }
  return DEFAULT_NUMBER_VALUE;
}

const getIntValue = (value) => {
  value = parseInt(value);
  if (value > 0) {
    return value;
  }
  return DEFAULT_NUMBER_VALUE;
}

const priceToSupplyGreaterThan = (price) => {
  const result = supplyData.find((item) => item.buyPrice > price).supply;
  return result;
}
const priceToSupplyLessThan = (price) => {
  const result = supplyData.find((item) => item.buyPrice > price).supply - 1;
  return result;
}

const minPriceToSupply = (price) => supplyData.find((item) => item.buyPrice >= price).supply;
const maxPriceToSupply = (price) => {
  const max = supplyData.find((item) => item.buyPrice <= price);
  return max.buyPrice === price ? max.supply : max.supply - 1;
}

const buildNumberFilter = (operator, value) => {
  if (value === null) {
    return false;
  }
  switch (operator) {
    case 'gt':
      return { $gt: getFloatValue(value) };
    case 'gte':
      return { $gte: getFloatValue(value) };
    case 'lt':
      return { $lt: getFloatValue(value) };
    case 'lte':
      return { $lte: getFloatValue(value) };
    case 'eq':
      return { $eq: getFloatValue(value) };
    case 'neq':
      return { $ne: getFloatValue(value) };
    case 'inrange':
      const res = {};
      if (value.start === value.end === null) {
        return false;
      }
      if (value.start !== null) {
        res['$gte'] = getFloatValue(value.start);
      }
      if (value.end !== null) {
        res['$lte'] = getFloatValue(value.end);
      }
    case 'notinrange':
      if (value.start !== null && value.end !== null) {
        return { $not: { $gte: getFloatValue(value.start), $lte: getFloatValue(value.end) } };
      } else if (value.start !== null) {
        return { $not: { $gte: getFloatValue(value.start) } };
      } else if (value.end !== null) {
        return { $not: { $lte: getFloatValue(value.end) } };
      } else {
        return false;
      }
  }
}

const getList = async (db, { skip, limit, sortInfo, filterValue }) => {

  const escapeStringRegexp = await import('escape-string-regexp');

  skip = getIntValue(skip);
  limit = getIntValue(limit);

  const query = {
    selfHoldings: { $gt: 0 },
    $and: []
  };

  if (filterValue && Array.isArray(filterValue)) {
    filterValue.filter(item => item.name === 'twitterName' && item.type === 'string' && item.value !== null && item.value !== '')
      .forEach(item => {
        const value = escapeStringRegexp.default(item.value);
        if (item.operator === 'contains') {
          query['$and'].push({ twitterName: { $regex: value, $options: 'i' } });
        } else if (item.operator === 'startsWith') {
          query['$and'].push({ twitterName: { $regex: `^${value}`, $options: 'i' } });
        } else if (item.operator === 'endsWith') {
          query['$and'].push({ twitterName: { $regex: `${value}$`, $options: 'i' } });
        }
      });
    filterValue.filter(item => ['twitterFollowers', 'price', 'supply',
      'twitterFriendsCount', 'twitterFavoritesCount', 'twitterStatusesCount', 'selfHoldings',
      'watchlistCount', 'holdingCount', 'holderCount', 'walletBalance', 'points', 'leaderboard'
    ].indexOf(item.name) > -1 && item.type === 'number')
      .forEach(item => {
        switch (item.name) {
          case 'twitterFollowers':
            const condition = buildNumberFilter(item.operator, item.value);
            if (condition) {
              query['$and'].push({ followers_count: condition });
            }
            break;
          case 'supply':
            const supplyCondition = buildNumberFilter(item.operator, item.value);
            if (supplyCondition) {
              query['$and'].push({ supply: supplyCondition });
            }
            break;
          case 'price':
            if (item.value === null) {
              break;
            }
            let priceCondition = null;
            if (item.operator === 'inrange') {
              if (item.value.start !== null && item.value.end !== null) {
                priceCondition = { $gte: minPriceToSupply(item.value.start), $lte: maxPriceToSupply(item.value.end) };
              } else if (item.value.start !== null) {
                item.operator = 'gte';
                item.value = item.value.start;
              } else if (item.value.end !== null) {
                item.operator = 'lte';
                item.value = item.value.end;
              } else {
                break;
              }
            }
            if (item.operator === 'notinrange') {
              if (item.value.start !== null && item.value.end !== null) {
                priceCondition = {
                  $not: {
                    $gte: minPriceToSupply(item.value.start),
                    $lte: maxPriceToSupply(item.value.end)
                  }
                };
              } else if (item.value.start !== null) {
                item.operator = 'lt';
                item.value = item.value.start;
              } else if (item.value.end !== null) {
                item.operator = 'gt';
                item.value = item.value.end;
              } else {
                break;
              }
            }
            if (item.operator === 'gt' || item.operator === 'gte') {
              priceCondition = { [`$${item.operator}`]: priceToSupplyGreaterThan(item.value) };
            }
            if (item.operator === 'lt' || item.operator === 'lte') {
              priceCondition = { [`$${item.operator}`]: priceToSupplyLessThan(item.value) };
            }
            if (priceCondition) {
              query['$and'].push({ supply: priceCondition });
            }
            break;
          case 'twitterFriendsCount':
          case 'twitterFavoritesCount':
          case 'twitterStatusesCount':
          case 'selfHoldings':
          case 'watchlistCount':
          case 'holdingCount':
          case 'holderCount':
          case 'walletBalance':
            const numberCondition = buildNumberFilter(item.operator, item.value);
            if (numberCondition) {
              query['$and'].push({ [item.name]: numberCondition });
            }
            break;
        }
      });

  }
  if (query['$and'].length === 0) {
    delete query['$and'];
  }

  // Sortowanie
  const sort = {};
  if (Array.isArray(sortInfo)) {
    sortInfo.forEach((item) => {
      const field = getSortField(item.name);
      const order = parseInt(item.dir);
      if (field && (order === 1 || order === -1)) {
        sort[field] = order;
      }
    });
  } else {
    const field = getSortField(sortInfo.name);
    const order = parseInt(sortInfo.dir);
    if (field && (order === 1 || order === -1)) {
      sort[field] = order;
    }
  }

  if (('leaderboard' in sort) || ('points' in sort)) {
    query['points'] = { $gt: 0 };
    query['leaderboard'] = { $gt: 0 };
  }

  console.log('search', JSON.stringify(query), JSON.stringify(sort));

  try {
    const collection = db.collection('users');
    const count = await collection.countDocuments(query);
    const users = await collection.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .toArray();
    return {
      status: 200,
      responseData: {
        items: users.map(user => ({
          address: user._id,
          twitterFollowers: user.followers_count,
          ...user,
          price: buyPriceData[user.supply],
          _id: undefined,
          followers_count: undefined,
          epoch: undefined,
          pointsLastUpdated: undefined,
          walletLastUpdated: undefined,
          twitterLastUpdated: undefined,
          ftLastUpdated: undefined,
        })),
        paginator: {
          count
        }
      }
    };
  } catch (err) {
    console.error('Error executing query', err);
    return {
      status: 500,
      responseData: {
        error: 'Error executing query'
      }
    };
  }

}

module.exports = getList;
