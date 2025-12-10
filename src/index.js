const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");

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
    this.setupStaticFiles();
    this.setupHeartbeat();
  }

  setupMiddleware() {
    // 跨域支持
    this.app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type");
      next();
    });
    // 解析JSON请求体
    this.app.use(express.json());
    // 解析URL编码请求体
    this.app.use(express.urlencoded({ extended: true }));

    // 简单的请求日志
    this.app.use((req, res, next) => {
      const timestamp = new Date().toLocaleTimeString();
      console.log(`[${timestamp}] ${req.method} ${req.url}`);
      next();
    });
  }

  setupRoutes() {
    // 根路由 - 显示简单信息
    this.app.get("/", (req, res) => {
      res.json({
        message: "聊天服务器正在运行",
        endpoints: {
          api: "/api/status",
          test: "/test",
          ws: "ws://" + (req.headers.host || "localhost:3000"),
        },
      });
    });
    this.app.get("/chat", (req, res) => {
      res.sendFile(path.join(__dirname, "../public/index.html"));
    });
    // API状态端点
    this.app.get("/api/status", (req, res) => {
      res.json({
        status: "running",
        onlineUsers: Array.from(this.clients.keys()),
        onlineCount: this.clients.size,
        messageCount: this.messageHistory.length,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
    });

    // 获取消息历史
    this.app.get("/api/messages", (req, res) => {
      const limit = parseInt(req.query.limit) || 20;
      const messages = this.messageHistory.slice(-limit);
      res.json({ messages });
    });
  }

  setupWebSocket() {
    // 导入WebSocket
    const WebSocket = require("ws");

    // 创建WebSocket服务器
    this.wss = new WebSocket.Server({ server: this.server });

    console.log("✅ WebSocket服务器已创建");

    this.wss.on("connection", (ws, req) => {
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
      this.clients.set(userId, ws);

      // 发送欢迎消息
      ws.send(
        JSON.stringify({
          type: "welcome",
          userId,
          timestamp: new Date().toISOString(),
          message: "欢迎来到聊天室！",
          onlineUsers: Array.from(this.clients.keys()),
          onlineCount: this.clients.size,
          messageHistory: this.messageHistory.slice(-10), // 发送最近10条消息
        })
      );

      // 广播新用户加入消息
      this.broadcast(
        {
          type: "user_joined",
          userId,
          timestamp: new Date().toISOString(),
          onlineCount: this.clients.size,
        },
        userId
      );

      // 处理接收到的消息
      ws.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(userId, message, ws);
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
        this.handleUserDisconnect(userId);
      });

      // 处理错误
      ws.on("error", (error) => {
        console.error(`❌ WebSocket错误 (${userId}):`, error);
        this.handleUserDisconnect(userId);
      });
    });

    // 定期清理无效连接
    setInterval(() => {
      this.cleanupDeadConnections();
    }, 30000); // 每30秒清理一次
  }

  setupStaticFiles() {
    // 根据是否打包选择不同的静态文件路径
    let publicPath;

    if (isPackaged) {
      // 打包后，文件在可执行文件旁边
      publicPath = path.join(process.cwd(), "public");

      // 如果不存在，尝试创建
      if (!fs.existsSync(publicPath)) {
        fs.mkdirSync(publicPath, { recursive: true });
        console.log("📁 创建 public 目录");
      }
    } else {
      // 开发环境
      publicPath = path.join(__dirname, "../public");
    }

    console.log(`📂 静态文件路径: ${publicPath}`);
    this.app.use(express.static(publicPath));

    // 聊天界面路由
    this.app.get("/chat", (req, res) => {
      const indexPath = path.join(publicPath, "index.html");

      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        // 如果文件不存在，提供备用页面
        res.send(`
                    <html>
                    <body>
                        <h1>聊天服务器正在运行</h1>
                        <p>请确保 public/index.html 文件存在</p>
                        <p>访问 <a href="/api/status">/api/status</a> 查看服务器状态</p>
                    </body>
                    </html>
                `);
      }
    });
  }

  // 广播消息给所有客户端（除了指定用户）
  broadcast(message, excludeUserId = null) {
    const data = JSON.stringify(message);
    this.clients.forEach((client, userId) => {
      // 检查连接是否活跃，且不是排除的用户
      if (userId !== excludeUserId && client.readyState === 1) {
        client.send(data);
      }
    });
  }

  // 处理WebSocket消息
  handleWebSocketMessage(userId, message, ws) {
    switch (message.type) {
      case "chat_message":
        this.handleChatMessage(userId, message);
        break;

      case "typing":
        this.handleTypingIndicator(userId, message);
        break;

      case "user_update":
        this.handleUserUpdate(userId, message);
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

  // 处理聊天消息
  handleChatMessage(userId, message) {
    const chatMessage = {
      type: "chat_message",
      messageId: Date.now().toString(36), // 生成消息ID
      userId,
      username: message.username || `用户${userId.substring(0, 6)}`, // 默认用户名
      content: message.content,
      timestamp: new Date().toISOString(),
    };

    // 添加到历史记录（限制最多100条）
    this.messageHistory.push(chatMessage);
    if (this.messageHistory.length > 100) {
      this.messageHistory.shift();
    }

    // 广播给所有用户
    this.broadcast(chatMessage);

    console.log(`💬 消息来自 ${chatMessage.username}: ${chatMessage.content}`);
  }

  // 处理用户正在输入指示
  handleTypingIndicator(userId, message) {
    this.broadcast(
      {
        type: "typing",
        userId,
        username: message.username || `用户${userId.substring(0, 6)}`,
        timestamp: new Date().toISOString(),
      },
      userId
    );
  }

  // 处理用户信息更新
  handleUserUpdate(userId, message) {
    this.broadcast({
      type: "user_update",
      userId,
      username: message.username || `用户${userId.substring(0, 6)}`,
      timestamp: new Date().toISOString(),
    });
  }

  // 处理用户断开连接
  handleUserDisconnect(userId) {
    if (this.clients.has(userId)) {
      this.clients.delete(userId);
      console.log(`👋 用户断开: ${userId}，当前在线: ${this.clients.size}`);

      // 通知其他用户
      this.broadcast({
        type: "user_left",
        userId,
        timestamp: new Date().toISOString(),
        onlineCount: this.clients.size,
      });
    }
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
        this.broadcast({
          type: "online_update",
          onlineCount: this.clients.size,
          timestamp: new Date().toISOString(),
        });
      }
    }, 30000); // 每30秒检测一次
  }

  // 清理死亡连接
  cleanupDeadConnections() {
    let removedCount = 0;

    this.clients.forEach((client, userId) => {
      if (client.readyState !== 1) {
        // 1 = OPEN
        this.clients.delete(userId);
        removedCount++;
      }
    });

    if (removedCount > 0) {
      console.log(`🧹 清理了 ${removedCount} 个无效连接`);
    }
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
