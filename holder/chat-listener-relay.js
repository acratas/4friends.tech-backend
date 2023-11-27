module.exports = (address, relayMessage, sendMessage) => {
  let _relayMessage = relayMessage;
  let _blacklist = [];
  return {
    setBlacklist: (blacklist) => {
      _blacklist = blacklist;
    },
    setMessage: (relayMessage) => {
      _relayMessage = relayMessage;
    },
    listener: async (message, next) => {
      if (
        message.chatRoomId === address &&
        message.type === 'receivedMessage' &&
        message.sendingUserId !== message.chatRoomId &&
        _blacklist.indexOf(message.sendingUserId.toLowerCase()) < 0
      ) {
        await sendMessage({
          chatRoomId: address,
          replyingToMessageId: message.messageId,
          text: `"${_relayMessage}"`
        })
        return;
      }
      await next();
    }
  }
}
