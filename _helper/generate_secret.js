const crypto = require('crypto');

const generateAppSecret = () => {
  return crypto.randomBytes(128).toString('hex');
};

console.log(generateAppSecret());
