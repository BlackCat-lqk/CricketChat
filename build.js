const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔨 开始构建聊天服务器...\n');

// 1. 创建dist目录
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
    console.log('✅ 创建 dist 目录');
}

// 2. 复制必要的文件
const filesToCopy = [
    'public'
];

filesToCopy.forEach(item => {
    const source = path.join(__dirname, item);
    const dest = path.join(distDir, item);
    
    if (fs.existsSync(source)) {
        if (fs.lstatSync(source).isDirectory()) {
            copyDir(source, dest);
        } else {
            fs.copyFileSync(source, dest);
        }
        console.log(`✅ 复制 ${item}`);
    }
});

// 3. 创建启动脚本
createStartScripts();

// 4. 提示用户
console.log('\n📦 构建完成！');
console.log('💡 现在可以运行以下命令打包：');
console.log('   npm run package      # 打包所有平台');
console.log('   npm run package:win  # 仅打包Windows');
console.log('   npm run package:mac  # 仅打包macOS');
console.log('   npm run package:linux # 仅打包Linux');

// 辅助函数：复制目录
function copyDir(source, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    
    const files = fs.readdirSync(source);
    files.forEach(file => {
        const srcPath = path.join(source, file);
        const destPath = path.join(dest, file);
        
        if (fs.lstatSync(srcPath).isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    });
}

// 创建启动脚本
function createStartScripts() {
    // Windows批处理脚本
    const winScript = `@echo off
echo 💬 局域网聊天服务器启动器
echo ========================================
echo 默认端口: 3000
echo 修改端口: set PORT=8080 && chat-server-win.exe
echo ========================================

set PORT=%1
if "%PORT%"=="" set PORT=3000

echo 启动端口: %PORT%
chat-server-win.exe
pause`;
    
    fs.writeFileSync(path.join(distDir, 'start-windows.bat'), winScript);
    
    // Linux/Mac启动脚本
    const unixScript = `#!/bin/bash
echo "💬 局域网聊天服务器启动器"
echo "========================================"
echo "默认端口: 3000"
echo "修改端口: PORT=8080 ./chat-server-linux"
echo "========================================"

PORT=\${1:-3000}
echo "启动端口: \$PORT"
PORT=\$PORT ./chat-server-linux`;
    
    fs.writeFileSync(path.join(distDir, 'start-linux.sh'), unixScript);
    fs.chmodSync(path.join(distDir, 'start-linux.sh'), '755');
    
    // Mac启动脚本
    const macScript = `#!/bin/bash
echo "💬 局域网聊天服务器启动器"
echo "========================================"
echo "默认端口: 3000"
echo "修改端口: PORT=8080 ./chat-server-macos"
echo "========================================"

PORT=\${1:-3000}
echo "启动端口: \$PORT"
PORT=\$PORT ./chat-server-macos`;
    
    fs.writeFileSync(path.join(distDir, 'start-mac.sh'), macScript);
    fs.chmodSync(path.join(distDir, 'start-mac.sh'), '755');
    
    console.log('✅ 创建启动脚本');
}