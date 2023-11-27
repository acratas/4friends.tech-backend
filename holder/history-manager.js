const dbInstance = require('./db-instance');
const axios = require('axios');
const { sleep } = require("../lib/utils");
const { MongoServerError } = require("mongodb");

const generateUrl = (address, pageStart = null) => `https://prod-api.kosetto.com/messages/${address}${pageStart ? `?pageStart=${pageStart}` : ''}`;

const getChatHistory = async (chatRoomId, jwt, address) => {
  const db =await dbInstance.getDb();
  let pageStart = null;
  let insertCount = 0;
  do {
    const url = generateUrl(chatRoomId, pageStart);
    const response = await axios.get(url, {
      headers: {
        'Authorization': jwt,
      }
    });
    console.log(`Fetching ${url}`);
    insertCount = 0;
    for (let message of response.data.messages) {
      try {
        await db.collection('messages').insertOne({
          owner: address,
          ...message,
        });
        insertCount++;
      } catch (e) {
        if (e instanceof MongoServerError && e.message.match(/E11000/)) {
          //pass
        } else {
          throw e;
        }
      }
    }
    pageStart = response.data.nextPageStart;
    await sleep(500);
  } while (pageStart && (insertCount > 0));
}
const collect = async (address, jwt) => {
  const holdings = await dbInstance.getHoldings(address);
  for (let holding of holdings) {
    await getChatHistory(holding, jwt, address);
  }
}

module.exports = {
  init : (address, jwt) => {
    collect(address, jwt);
  },
  getMessages: async (owner, params) => {
    const db = await dbInstance.getDb();
    let query = { owner };

    if (params.lastMessageId) {
      query.messageId = { $lt: params.lastMessageId };
    }

    if (params.query) {
      query.text = { $regex: params.query, $options: 'i' };
    }

    const messages = await db.collection('messages')
      .aggregate([
        { $match: query },
        { $sort: { messageId: -1 } },
        { $limit: 20 },
        {
          $lookup: {
            from: 'users',
            localField: 'sendingUserId',
            foreignField: '_id',
            as: 'userDetails'
          }
        },
        {
          $unwind: '$userDetails'
        },
        {
          $lookup: {
            from: 'users',
            localField: 'replyingToMessage.sendingUserId',
            foreignField: '_id',
            as: 'replyingUserDetails'
          }
        },
        {
          $unwind: {
            path: '$replyingUserDetails',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $addFields: {
            'twitterPfpUrl': '$userDetails.twitterPfpUrl',
            'replyingToMessage.twitterPfpUrl': '$replyingUserDetails.twitterPfpUrl'
          }
        },
        {
          $project: {
            'userDetails': 0,
            'replyingUserDetails': 0
          }
        }
      ])
      .toArray();

    return messages;
  }
}
