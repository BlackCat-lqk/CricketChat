// 全局变量
let ws = null;
let userId = "";
let username = "";
let typingTimeout = null;

// 随机生成昵称
function generateUsername() {
  const adjectives = [
    "快乐的",
    "聪明的",
    "好奇的",
    "安静的",
    "活泼的",
    "勤奋的",
  ];
  const nouns = ["小猫", "小狗", "熊猫", "兔子", "松鼠", "小鸟"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return adj + noun;
}

// 连接WebSocket
function connectWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    updateStatus("已连接", true);
    document.getElementById("sendButton").disabled = false;
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleWebSocketMessage(data);
  };

  ws.onclose = () => {
    updateStatus("已断开", false);
    document.getElementById("sendButton").disabled = true;
    // 3秒后重连
    setTimeout(connectWebSocket, 3000);
  };

  ws.onerror = (error) => {
    console.error("WebSocket错误:", error);
    updateStatus("连接错误", false);
  };
}

// 处理WebSocket消息
function handleWebSocketMessage(data) {
  switch (data.type) {
    case "welcome":
      userId = data.userId;
      username = generateUsername();
      document.getElementById("userId").textContent = userId.substring(0, 8);
      document.getElementById("currentUsername").textContent = username;
      document.getElementById("usernameInput").value = username;
      document.getElementById("onlineCount").textContent = data.onlineCount;

      // 显示历史消息
      if (data.messageHistory) {
        data.messageHistory.forEach((msg) => addMessageToChat(msg));
      }
      break;

    case "chat_message":
      addMessageToChat(data);
      break;

    case "user_joined":
      addSystemMessage(`👤 ${data.userId.substring(0, 8)} 加入了聊天`);
      document.getElementById("onlineCount").textContent = data.onlineCount;
      break;

    case "user_left":
      addSystemMessage(`👤 ${data.userId.substring(0, 8)} 离开了聊天`);
      document.getElementById("onlineCount").textContent = data.onlineCount;
      break;

    case "typing":
      showTypingIndicator(data.username);
      break;

    case "user_update":
      // 用户信息更新，可以在这里处理
      break;
  }
}

// 发送消息
function sendMessage() {
  const input = document.getElementById("messageInput");
  const content = input.value.trim();

  if (content && ws && ws.readyState === WebSocket.OPEN) {
    const message = {
      type: "chat_message",
      content: content,
      username: username,
    };

    ws.send(JSON.stringify(message));
    input.value = "";

    // 清空输入指示
    document.getElementById("typingIndicator").textContent = "";
  }
}

// 发送"正在输入"指示
function sendTypingIndicator() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "typing",
        username: username,
      })
    );

    // 清除之前的定时器
    if (typingTimeout) clearTimeout(typingTimeout);

    // 2秒后停止显示输入状态
    typingTimeout = setTimeout(() => {
      document.getElementById("typingIndicator").textContent = "";
    }, 2000);
  }
}

// 更新用户名
function updateUsername() {
  const newUsername = document.getElementById("usernameInput").value.trim();
  if (newUsername && newUsername !== username) {
    username = newUsername;
    document.getElementById("currentUsername").textContent = username;

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "user_update",
          username: username,
        })
      );
    }
    addSystemMessage(`😎你的昵称已更新为: ${username}`);
  }
}

// 添加消息到聊天窗口
function addMessageToChat(message) {
  const container = document.getElementById("messagesContainer");
  const messageDiv = document.createElement("div");

  const isOwnMessage = message.userId === userId;
  const isSystem = message.type === "system_message";

  if (isSystem) {
    messageDiv.className = "message system";
    messageDiv.textContent = message.content;
  } else {
    messageDiv.className = `message ${isOwnMessage ? "own" : "other"}`;

    const time = new Date(message.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    messageDiv.innerHTML = `
                    <div class="message-header">
                        <span>${message.username || "匿名用户"}</span>
                        <span>${time}</span>
                    </div>
                    <div>${escapeHtml(message.content)}</div>
                `;
  }

  container.appendChild(messageDiv);
  container.scrollTop = container.scrollHeight;
}

// 添加系统消息
function addSystemMessage(content) {
  addMessageToChat({
    type: "system_message",
    content: content,
    timestamp: new Date().toISOString(),
  });
}

// 显示"正在输入"指示
function showTypingIndicator(typingUsername) {
  const indicator = document.getElementById("typingIndicator");
  if (typingUsername !== username) {
    indicator.textContent = `${typingUsername} 正在输入...`;
  }
}

// 更新连接状态
function updateStatus(text, isConnected) {
  const dot = document.getElementById("statusDot");
  const textElem = document.getElementById("statusText");

  dot.className = `status-dot ${isConnected ? "connected" : "disconnected"}`;
  textElem.textContent = text;
}

// 处理按键事件
function handleKeyPress(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    sendMessage();
  }
}

// HTML转义
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// 页面加载时连接WebSocket
window.onload = connectWebSocket;
