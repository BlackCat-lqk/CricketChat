const path = require('path');
const fs = require('fs');
const express = require('express');

/**
 * 设置应用路由
 * @param {express.Application} app - Express应用实例
 * @param {Map} clients - 客户端连接映射
 * @param {Array} messageHistory - 消息历史数组
 * @param {boolean} isPackaged - 是否被打包运行
 */
function setupRoutes(app, clients, messageHistory, isPackaged) {
  // 根路由 - 显示简单信息
  app.get("/", (req, res) => {
    res.json({
      message: "聊天服务器正在运行",
      endpoints: {
        api: "/api/status",
        test: "/test",
        ws: "ws://" + (req.headers.host || "localhost:3000"),
      },
    });
  });

  // API状态端点
  app.get("/api/status", (req, res) => {
    res.json({
      status: "running",
      onlineUsers: Array.from(clients.keys()),
      onlineCount: clients.size,
      messageCount: messageHistory.length,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // 获取消息历史
  app.get("/api/messages", (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const messages = messageHistory.slice(-limit);
    res.json({ messages });
  });

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
  app.use(express.static(publicPath));

  // 聊天界面路由
  app.get("/chat", (req, res) => {
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

module.exports = { setupRoutes };