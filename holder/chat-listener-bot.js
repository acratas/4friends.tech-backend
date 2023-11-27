const wall = async (message, config, sendMessage) => {
  if (!message.text?.match(/^[\\"]*\!wall/)) {
    return false;
  }
  if (!config.wall?.enabled || !config.wall?.message) {
    return true;
  }
  if (config.wall?.blacklist?.indexOf(message.sendingUserId) >= 0) {
    return true;
  }
  await sendMessage({
    chatRoomId: message.chatRoomId,
    replyingToMessageId: message.messageId,
    text: `${config.wall.message}`
  })
  return true;
}
const forward = async (message, config, sendMessage) => {
  if (!message.text?.match(/^[\\"]*\!forward/)) {
    return false;
  }
  if (!config.forward?.enabled) {
    return true;
  }
  if (config.forward?.whitelist === '*' || config.forward?.whitelist?.indexOf(message.sendingUserId) >= 0) {
    await sendMessage({
      chatRoomId: message.chatRoomId,
      text: `${message.text.replace(/\!forward/, '')}`
    })
  }
  return true;
}
const help = async (message, config, sendMessage) => {
  if (!message.text.match(/^[\\"]*\!help/)) {
    return false;
  }
  if (!config.help?.enabled) {
    return true;
  }
  if (config.help?.blacklist?.indexOf(message.sendingUserId) >= 0) {
    return true;
  }
  await sendMessage({
    chatRoomId: message.chatRoomId,
    replyingToMessageId: message.messageId,
    text: config.help?.message ?
      `${config.help.message}` :
      `Available commands:\n!help - displays this message${config.wall?.enabled ? "\n!wall - sends a message visible to all chatroom users": ""}${config.forward?.enabled ? "\n!forward - sends a message as the owner" : ""}`
  })
  return true;
}
module.exports = (address, config, sendMessage) => {
  let _config = {...config};
  return {
    setConfig: async (config, userList) => {
      _config = {...config};
      _config.help = _config.help || {};
      _config.help.blacklist = await userList(_config.help.blacklist || null);
      _config.wall = _config.wall || {};
      _config.wall.blacklist = await userList(_config.wall.blacklist || null);
      _config.forward = _config.forward || {};
      _config.forward.whitelist = _config.forward.whitelist === '*' ? '*' : await userList(_config.forward.whitelist || null);
    },
    listener: async (message, next) => {
      if (
        message.chatRoomId === address &&
        message.type === 'receivedMessage' &&
        message.sendingUserId !== message.chatRoomId
      ) {
        if (await wall(message, _config, sendMessage)) return;
        if (await forward(message, _config, sendMessage)) return;
        if (await help(message, _config, sendMessage)) return;
        if (message.text?.match(/^[\\"]*\!/)) return;
      }
      await next();
    }
  }
}
