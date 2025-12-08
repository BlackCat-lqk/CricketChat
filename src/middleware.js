const express = require('express');

/**
 * 设置应用中间件
 * @param {express.Application} app - Express应用实例
 */
function setupMiddleware(app) {
  // 跨域支持
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
  });
  
  // 解析JSON请求体
  app.use(express.json());
  // 解析URL编码请求体
  app.use(express.urlencoded({ extended: true }));

  // 简单的请求日志
  app.use((req, res, next) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${req.method} ${req.url}`);
    next();
  });
}

module.exports = { setupMiddleware };