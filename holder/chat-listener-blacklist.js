const { getUser } = require("../lib/api-result2");
module.exports = (db, blacklist) => {
    let _blacklist = blacklist;
    const users = {};
    return {
      setBlacklist: (blacklist) => {
        _blacklist = blacklist;
      },
      listener: async (message, next) => {
        const userAddress = message.sendingUserId.toLowerCase();
        if (!users[userAddress]) {
          users[userAddress] = (await getUser(db, userAddress)).twitterUsername;
        }
        const twitterUsername = users[userAddress];
        if (twitterUsername && _blacklist.indexOf(twitterUsername) >= 0) {
          return;
        }
        await next();
      }
    }
}
