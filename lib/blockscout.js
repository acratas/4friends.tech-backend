const axios = require('axios');
const Bottleneck = require('bottleneck');

const CONTRACT = process.env.CONTRACT_ADDRESS
const limiter = new Bottleneck({
  reservoir: 10,
  reservoirRefreshAmount: 10,
  reservoirRefreshInterval: 1000,
});

const _get = async (url) => {
  console.warn(new Date(), '[GET]', url.toString());
  url = typeof url === 'string' ? new URL(url) : url;
  url.searchParams.set('apikey', process.env.BLOCKSCOUT_API_KEY);
  const response = await axios.get(url.toString());
  return response.data;
}

const get = async (url) => {
  try {
    return await limiter.schedule(() => _get(url));
  } catch (error) {
    console.error(error);
    throw error;
  }
}

const getList = async (
  url,
  address,
  filter = (tx) => true,
  mapper = item => item,
  startBlock = 0
) => {
  const list = {};
  let next_page_params = null;
  url = new URL(url);
  do {
    const response = await get(url);
    const items = response.items.filter(item => !item.error).filter(filter).map(mapper);
    for (let item of items) {
      if (item.block <= startBlock) {
        // return list;
      }
      list[item.hash] = item;
    }
    next_page_params = response.next_page_params;
    if (next_page_params !== null) {
      for (let key in next_page_params) {
        url.searchParams.set(key, next_page_params[key]);
      }
    }
  } while (next_page_params !== null);
  return list;
}

const getInternalTransactions = async (address, startBlock) => {
  return await getList(
    `${process.env.BLOCKSCOUT_URL}/addresses/${address}/internal-transactions?filter=${CONTRACT}&start_block=${startBlock}`,
    address,
    tx => !!tx.success,
    tx => ({
      block: tx.block,
      hash: tx.transaction_hash,
      value: tx.value,
      address
    }),
    startBlock
  );
}

const getTransactions = async (address, startBlock) => {
  return await getList(
    `${process.env.BLOCKSCOUT_URL}/addresses/${address}/transactions?filter=${CONTRACT}&start_block=${startBlock}`,
    address,
    tx => tx.result === 'success' && tx.to.hash === CONTRACT,
    tx => ({
      block: tx.block,
      result: tx.result,
      hash: tx.hash,
      timestamp: tx.timestamp,
      gasFee: `-${tx.fee.value}`,
      isBuy: tx.method === 'buyShares',
      value: `-${tx.value}`,
      address: tx.decoded_input.parameters[0].value,
      amount: parseInt(tx.decoded_input.parameters[1].value)
    }),
    startBlock);
}

const getBalance = async (address) => {
  const response = await get(`${process.env.BLOCKSCOUT_URL}/addresses/${address}`);
  return response.coin_balance;
}

const getFriendValue = async (address, amount) => {
  const response = await axios.post(`${process.env.BLOCKSCOUT_URL}/smart-contracts/${CONTRACT}/query-read-method?apikey=${process.env.BLOCKSCOUT_API_KEY}&is_custom_abi=false`, {
    args: [
      address,
      amount
    ],
    contract_type: 'regular',
    method_id: '2267a89c'
  })
  return response.data.result.output[0].value.toString();
}

module.exports = {
  getInternalTransactions,
  getTransactions,
  getBalance,
  getFriendValue
}
