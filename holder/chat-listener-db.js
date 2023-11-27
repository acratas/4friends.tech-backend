module.exports = (db, address) => {
  return {
    listener : async (message, next) => {
      try {
        db.collection('messages').insertOne({
          owner: address,
          ...message,
        });
      } catch (error) {
        console.error(error);
      }
      await next();
    }
  }
}
