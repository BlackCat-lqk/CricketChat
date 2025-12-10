const express = require("express");
const http = require("http");
const { setupMiddleware } = require("./middleware");
const { setupRoutes } = require("./routes");
const { setupWebSocket, broadcast } = require("./websocket");

// 检查是否被打包运行
const isPackaged = typeof process.pkg !== "undefined";

class ChatServer {
  constructor(port = 3000) {
    this.port = port;
    this.app = express();
    this.server = http.createServer(this.app);
    this.clients = new Map();
    this.messageHistory = [];

    console.log(isPackaged ? "📦 打包版聊天服务器" : "🚀 开发版聊天服务器");
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupHeartbeat();
  }

  setupMiddleware() {
    setupMiddleware(this.app);
  }

  setupRoutes() {
    setupRoutes(this.app, this.clients, this.messageHistory, isPackaged);
  }

  setupWebSocket() {
    this.wss = setupWebSocket(this.server, this.clients, this.messageHistory);
  }

  // 添加心跳检测方法
  setupHeartbeat() {
    // 定期发送心跳并检测死亡连接
    setInterval(() => {
      let removedCount = 0;

      // 可以在这里添加更复杂的心跳检测逻辑
      this.clients.forEach((client, userId) => {
        if (client.readyState !== 1) {
          // 1 = OPEN
          this.clients.delete(userId);
          removedCount++;
        }
      });

      if (removedCount > 0) {
        console.log(`🧹 自动清理了 ${removedCount} 个无效连接`);
        // 更新在线人数显示
        broadcast(this.clients, {
          type: "online_update",
          onlineCount: this.clients.size,
          timestamp: new Date().toISOString(),
        });
      }
    }, 30000); // 每30秒检测一次
  }

  start() {
    this.server.listen(this.port, "0.0.0.0", () => {
      const os = require("os");
      const networkInterfaces = os.networkInterfaces();
      let localIp = "localhost";

      // 获取本地IP地址
      for (const name of Object.keys(networkInterfaces)) {
        for (const net of networkInterfaces[name]) {
          if (net.family === "IPv4" && !net.internal) {
            localIp = net.address;
            break;
          }
        }
      }

      console.log("=".repeat(60));
      console.log("🚀 聊天服务器已启动！");
      console.log("=".repeat(60));
      console.log(`📱 本地访问:   http://localhost:${this.port}`);
      console.log(`🌐 局域网访问: http://${localIp}:${this.port}`);
      console.log("-".repeat(60));
      console.log(`📄 测试页面:   http://${localIp}:${this.port}/test`);
      console.log(`📊 API状态:    http://${localIp}:${this.port}/api/status`);
      console.log(`🔗 WebSocket:  ws://${localIp}:${this.port}`);
      console.log("=".repeat(60));
      console.log("💬 实时聊天功能已启用！");
      console.log("📱 在同一局域网内的设备都可以连接使用");
    });
  }
}

// 如果直接运行此文件
if (require.main === module) {
  const port = process.env.PORT || 3000;
  const server = new ChatServer(port);
  server.start();
}

module.exports = ChatServer;