const WebSocket = require('ws');

/**
 * 广播消息给所有客户端（除了指定用户）
 * @param {Map} clients - 客户端连接映射
 * @param {Object} message - 要广播的消息
 * @param {string} excludeUserId - 要排除的用户ID
 */
function broadcast(clients, message, excludeUserId = null) {
  const data = JSON.stringify(message);
  clients.forEach((client, userId) => {
    // 检查连接是否活跃，且不是排除的用户
    if (userId !== excludeUserId && client.readyState === 1) {
      client.send(data);
    }
  });
}

/**
 * 设置WebSocket服务器
 * @param {http.Server} server - HTTP服务器实例
 * @param {Map} clients - 客户端连接映射
 * @param {Array} messageHistory - 消息历史数组
 */
function setupWebSocket(server, clients, messageHistory) {
  // 创建WebSocket服务器
  const wss = new WebSocket.Server({ server });

  console.log("✅ WebSocket服务器已创建");

  wss.on("connection", (ws, req) => {
    // 生成简单用户ID（时间戳+随机数）
    const generateUserId = () => {
      return (
        Date.now().toString(36) + Math.random().toString(36).substr(2, 5)
      );
    };

    const userId = generateUserId();
    const userIp = req.socket.remoteAddress;

    console.log(`👤 新用户连接: ${userId} (IP: ${userIp})`);

    // 存储连接
    clients.set(userId, ws);

    // 发送欢迎消息
    ws.send(
      JSON.stringify({
        type: "welcome",
        userId,
        timestamp: new Date().toISOString(),
        message: "欢迎来到聊天室！",
        onlineUsers: Array.from(clients.keys()),
        onlineCount: clients.size,
        messageHistory: messageHistory.slice(-10), // 发送最近10条消息
      })
    );

    // 广播新用户加入消息
    broadcast(clients, {
      type: "user_joined",
      userId,
      timestamp: new Date().toISOString(),
      onlineCount: clients.size,
    }, userId);

    // 处理接收到的消息
    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleWebSocketMessage(clients, messageHistory, userId, message, ws);
      } catch (error) {
        console.error("❌ 消息解析错误:", error);
        ws.send(
          JSON.stringify({
            type: "error",
            message: "消息格式错误",
            timestamp: new Date().toISOString(),
          })
        );
      }
    });

    // 处理断开连接
    ws.on("close", () => {
      handleUserDisconnect(clients, userId);
    });

    // 处理错误
    ws.on("error", (error) => {
      console.error(`❌ WebSocket错误 (${userId}):`, error);
      handleUserDisconnect(clients, userId);
    });
  });

  // 定期清理无效连接
  setInterval(() => {
    cleanupDeadConnections(clients);
  }, 30000); // 每30秒清理一次

  return wss;
}

/**
 * 处理WebSocket消息
 * @param {Map} clients - 客户端连接映射
 * @param {Array} messageHistory - 消息历史数组
 * @param {string} userId - 用户ID
 * @param {Object} message - 接收到的消息
 * @param {WebSocket} ws - WebSocket连接
 */
function handleWebSocketMessage(clients, messageHistory, userId, message, ws) {
  switch (message.type) {
    case "chat_message":
      handleChatMessage(clients, messageHistory, userId, message);
      break;

    case "typing":
      handleTypingIndicator(clients, userId, message);
      break;

    case "user_update":
      handleUserUpdate(clients, userId, message);
      break;

    default:
      console.log("未知消息类型:", message.type);
      ws.send(
        JSON.stringify({
          type: "error",
          message: "未知的消息类型",
          timestamp: new Date().toISOString(),
        })
      );
  }
}

/**
 * 处理聊天消息
 * @param {Map} clients - 客户端连接映射
 * @param {Array} messageHistory - 消息历史数组
 * @param {string} userId - 用户ID
 * @param {Object} message - 聊天消息
 */
function handleChatMessage(clients, messageHistory, userId, message) {
  const chatMessage = {
    type: "chat_message",
    messageId: Date.now().toString(36), // 生成消息ID
    userId,
    username: message.username || `用户${userId.substring(0, 6)}`, // 默认用户名
    content: message.content,
    timestamp: new Date().toISOString(),
  };

  // 添加到历史记录（限制最多100条）
  messageHistory.push(chatMessage);
  if (messageHistory.length > 100) {
    messageHistory.shift();
  }

  // 广播给所有用户
  broadcast(clients, chatMessage);

  console.log(`💬 消息来自 ${chatMessage.username}: ${chatMessage.content}`);
}

/**
 * 处理用户正在输入指示
 * @param {Map} clients - 客户端连接映射
 * @param {string} userId - 用户ID
 * @param {Object} message - 输入指示消息
 */
function handleTypingIndicator(clients, userId, message) {
  broadcast(
    clients,
    {
      type: "typing",
      userId,
      username: message.username || `用户${userId.substring(0, 6)}`,
      timestamp: new Date().toISOString(),
    },
    userId
  );
}

/**
 * 处理用户信息更新
 * @param {Map} clients - 客户端连接映射
 * @param {string} userId - 用户ID
 * @param {Object} message - 用户更新消息
 */
function handleUserUpdate(clients, userId, message) {
  broadcast(clients, {
    type: "user_update",
    userId,
    username: message.username || `用户${userId.substring(0, 6)}`,
    timestamp: new Date().toISOString(),
  });
}

/**
 * 处理用户断开连接
 * @param {Map} clients - 客户端连接映射
 * @param {string} userId - 用户ID
 */
function handleUserDisconnect(clients, userId) {
  if (clients.has(userId)) {
    clients.delete(userId);
    console.log(`👋 用户断开: ${userId}，当前在线: ${clients.size}`);

    // 通知其他用户
    broadcast(clients, {
      type: "user_left",
      userId,
      timestamp: new Date().toISOString(),
      onlineCount: clients.size,
    });
  }
}

/**
 * 清理死亡连接
 * @param {Map} clients - 客户端连接映射
 */
function cleanupDeadConnections(clients) {
  let removedCount = 0;

  clients.forEach((client, userId) => {
    if (client.readyState !== 1) {
      // 1 = OPEN
      clients.delete(userId);
      removedCount++;
    }
  });

  if (removedCount > 0) {
    console.log(`🧹 清理了 ${removedCount} 个无效连接`);
  }
}

module.exports = { 
  setupWebSocket, 
  broadcast, 
  handleWebSocketMessage, 
  handleChatMessage, 
  handleTypingIndicator, 
  handleUserUpdate, 
  handleUserDisconnect, 
  cleanupDeadConnections 
};