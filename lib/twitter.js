const Twit = require('twit');

const twitter = (consumer_key, consumer_secret, access_token, access_token_secret) => {
  const T = new Twit({
    consumer_key: consumer_key,
    consumer_secret: consumer_secret,
    access_token: access_token,
    access_token_secret: access_token_secret
  });

  return {
    getUser: async (twitter_id) => {
      return new Promise((resolve, reject) => {
        T.get('users/show', { user_id: twitter_id }, function (err, data, response) {
          if (err) reject(err);
          else resolve(data);
        });
      });
    },
    getUsers: async (twitter_ids) => {
      return new Promise((resolve, reject) => {
        T.get('users/lookup', { user_id: twitter_ids.join(',') }, function (err, data, response) {
          if (err) reject(err);
          else resolve(data);
        });
      });
    }
  }
}


module.exports = twitter;
