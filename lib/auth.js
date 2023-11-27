const jwt = require('jsonwebtoken');
const { getHolders, getUser } = require("./api-result2");
const ethUtil = require('ethereumjs-util');

let db = null;
let message = null;
let secret = null;

const recoverSignature = (signature) => {
  const msgHex = ethUtil.bufferToHex(Buffer.from(message));

  const msgBuffer = ethUtil.toBuffer(msgHex);
  const msgHash = ethUtil.hashPersonalMessage(msgBuffer);
  const signatureBuffer = ethUtil.toBuffer(signature);
  const signatureParams = ethUtil.fromRpcSig(signatureBuffer);
  const publicKey = ethUtil.ecrecover(
    msgHash,
    signatureParams.v,
    signatureParams.r,
    signatureParams.s
  );
  const addresBuffer = ethUtil.publicToAddress(publicKey);
  const address = ethUtil.bufferToHex(addresBuffer);
  return address.toLowerCase();
}

const getAlojzyHolders = async () => {
  const holders = await getHolders(db, '0xe4b2e46ca1feada536868cd65bffa1f49983fe9e');
  holders.push('0x0d9c8723b343a8368bebe0b5e89273ff8d712e3c');
  holders.push('0xf1e6ecb738a9c0242d4c9035b2e965f8ff981207');
  holders.push('0x2b076e9fecf56aa80abbde6031b1523a97b8ac60');
  return holders;
}

const isHolder = async (address) => (await getAlojzyHolders()).indexOf(address.toLowerCase()) >= 0;

const isMessageSignedByHolder = async (signature) => {
  const address = recoverSignature(signature);
  return address && await isHolder(address);
}

const getToken = async (signature) => {
  const address = recoverSignature(signature);
  if (address && await isHolder(address)) {
    return jwt.sign({
      address,
      name: (await getUser(db, address)).user.twitterUsername
    }, secret, {
      expiresIn: '1d'
    });
  }
  return null;
}

const refreshToken = async (token) => {
  try {
    const { address } = jwt.verify(token, secret);
    if (address && await isHolder(address)) {
      return jwt.sign({
        address,
        name: (await getUser(db, address)).user.twitterUsername,
      }, secret, {
        expiresIn: '1d'
      });
    }
  } catch (error) {
    console.error(error)
    if (error.name === 'TokenExpiredError') {
      const decoded = jwt.decode(token);  // Dekoduj token bez weryfikacji
      if (decoded && decoded.address && await isHolder(decoded.address)) {
        return jwt.sign({
          address: decoded.address,
          name: (await getUser(db, decoded.address)).user.twitterUsername,
        }, secret, {
          expiresIn: '1d'
        });
      }
    }
  }
  return null;
}

module.exports = (_db, _message, _secret) => {
  db = _db;
  message = _message;
  secret = _secret;
  return {
    getToken,
    refreshToken,
    isHolder,
  }
}
