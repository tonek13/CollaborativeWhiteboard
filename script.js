document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("whiteboard");
  const colorPicker = document.getElementById("colorPicker");
  const brushSizeSelector = document.getElementById("brushSize");
  const clearButton = document.getElementById("clearButton");
  const eraserTool = document.getElementById("eraserTool");
  const drawingTool = document.getElementById("drawingTool");
  const disconnectButton = document.getElementById("disconnectButton");
  const ctx = canvas.getContext("2d");
  const messageInput = document.getElementById("messageInput");
  const sendMessageButton = document.getElementById("sendMessageButton");
  let currentColor = colorPicker.value;
  let currentBrushSize = parseInt(brushSizeSelector.value || "4", 10);
  let isDrawing = false;
  let username = null;
  let lastX = 0, lastY = 0;

  // ==== Robust WebSocket setup (auto-reconnect + keep-alive) ====
  const WS_URL = "wss://collaborativewhiteboard-6zp4.onrender.com";
  let socket;
  let reconnectAttempts = 0;
  const MAX_RETRIES = 10;

  // keep-alive timers
  const PING_EVERY_MS = 25_000;
  const PONG_WAIT_MS = 10_000;
  let pingTimer = null;
  let pongTimer = null;

  function startKeepAlive() {
    stopKeepAlive();
    pingTimer = setInterval(() => {
      safeSend({ type: "ping" });
      clearTimeout(pongTimer);
      pongTimer = setTimeout(() => {
        // If no pong within PONG_WAIT_MS, force a reconnect
        try { socket && socket.close(); } catch (_) {}
      }, PONG_WAIT_MS);
    }, PING_EVERY_MS);
  }
  function stopKeepAlive() {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
  }

  function connectSocket() {
    socket = new WebSocket(WS_URL);

    socket.onopen = () => {
      reconnectAttempts = 0;
      startKeepAlive();
      promptForUsername(); // Send newUser once connected
      // ask server to replay existing drawing
      safeSend({ type: "requestAllDrawingData" });
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        // keep-alive response
        if (message.type === "pong") {
          clearTimeout(pongTimer);
          return;
        }

        if (message.type === "draw") {
          handleDrawing(message);
        } else if (message.type === "userListUpdate") {
          updateUserList(message.users);
        } else if (message.type === "stopDrawing") {
          ctx.beginPath();
        } else if (message.type === "erase") {
          erase(message);
        } else if (message.type === "clear") {
          clearCanvas();
        } else if (message.type === "drawerUsername") {
          updateUserDrawer(message.username);
        } else if (message.type === "chatMessage") {
          displayChatMessage(message.username, message.message);
        } else if (message.type === "drawingData") {
          handleDrawingData(message.data);
        }
      } catch (err) {
        console.error("Error parsing JSON message:", err);
      }
    };

    socket.onclose = (event) => {
      stopKeepAlive();
      // If user clicked Disconnect, don't auto-reconnect
      if (event.code === 1000 && event.reason === "User disconnected") return;

      // Exponential backoff with jitter
      const delay = Math.min(30_000, (2 ** reconnectAttempts) * 1000 + Math.random() * 500);
      reconnectAttempts = Math.min(reconnectAttempts + 1, MAX_RETRIES);
      console.warn(`WS closed (code ${event.code}). Reconnecting in ${Math.round(delay / 1000)}s...`);
      setTimeout(connectSocket, delay);
    };

    socket.onerror = () => {
      // Let onclose handle reconnect; avoid alert spam
      try { socket.close(); } catch (_) {}
    };
  }

  // send only if socket is open
  function safeSend(obj) {
    try {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(obj));
      }
    } catch (e) {
      console.error("send failed:", e);
    }
  }

  // Attempt to reconnect when network comes back
  window.addEventListener("online", () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) connectSocket();
  });

  connectSocket();
  // ===============================================================

  // Responsive canvas: scale to CSS size and device pixel ratio
  function resizeCanvasPreserve() {
    const rect = canvas.getBoundingClientRect();
    if (!rect || rect.width < 1 || rect.height < 1) {
      requestAnimationFrame(resizeCanvasPreserve);
      return;
    }
    const dataUrl = canvas.toDataURL();
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.scale(dpr, dpr);
    if (dataUrl) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, rect.width, rect.height); };
      img.src = dataUrl;
    }
  }
  window.addEventListener("resize", resizeCanvasPreserve);
  window.addEventListener("orientationchange", resizeCanvasPreserve);
  window.addEventListener("load", () => requestAnimationFrame(resizeCanvasPreserve));
  requestAnimationFrame(resizeCanvasPreserve);

  // Chat send
  function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
      safeSend({ type: "chatMessage", username, message });
      messageInput.value = "";
    }
  }
  sendMessageButton.addEventListener("click", sendMessage);

  function promptForUsername() {
    if (!username) {
      username = prompt("Please enter your username:");
    }
    if (username) {
      safeSend({ type: "newUser", username });
    } else {
      console.log("Username not provided.");
    }
  }

  canvas.addEventListener("pointerdown", () => {
    if (username) safeSend({ type: "username", username });
  });

  disconnectButton.addEventListener("click", () => {
    try { socket && socket.close(1000, "User disconnected"); } catch (_) {}
  });

  // NOTE: ensure these elements exist in your HTML
  if (typeof fileInput !== "undefined") fileInput.addEventListener("change", handleFileInputChange);
  if (typeof saveButton !== "undefined") saveButton.addEventListener("click", saveCanvas);

  function displayChatMessage(username, message) {
    const chatBox = document.getElementById("chat");
    const messageElement = document.createElement("div");
    messageElement.textContent = `${username}: ${message}`;
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  function handleDrawing(message) {
    const { type, x, y, color, size } = message;
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = "round";
    if (type === "drawStart") {
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else if (type === "draw") {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }

  // Support erase messages coming from other clients
  function erase(msgOrEvent) {
    const isRemote = typeof msgOrEvent === "object" && "x" in msgOrEvent && !("offsetX" in msgOrEvent);
    const rect = canvas.getBoundingClientRect();
    const x = isRemote ? msgOrEvent.x : (msgOrEvent.offsetX ?? 0);
    const y = isRemote ? msgOrEvent.y : (msgOrEvent.offsetY ?? 0);
    const size = isRemote ? msgOrEvent.size : (parseInt(currentBrushSize, 10) || 4);
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function toggleDrawingMode() {
    drawingTool.checked = true;
    eraserTool.checked = false;
    currentColor = colorPicker.value;
  }

  function toggleEraserMode() {
    eraserTool.checked = true;
    drawingTool.checked = false;
    currentColor = canvas.style.backgroundColor;
  }

  drawingTool.addEventListener("change", () => {
    if (drawingTool.checked) toggleDrawingMode();
    else toggleEraserMode();
  });

  eraserTool.addEventListener("change", () => {
    if (eraserTool.checked) toggleEraserMode();
    else toggleDrawingMode();
  });

  function updateUserList(users) {
    const userListElement = document.getElementById("userList");
    userListElement.innerHTML = "";
    users.forEach((user) => {
      const li = document.createElement("li");
      li.textContent = `ID: ${user.id}, Username: ${user.username}`;
      userListElement.appendChild(li);
    });
  }

  colorPicker.addEventListener("input", () => {
    currentColor = colorPicker.value;
  });

  brushSizeSelector.addEventListener("change", () => {
    currentBrushSize = parseInt(brushSizeSelector.value || "4", 10);
  });

  clearButton.addEventListener("click", () => {
    clearCanvas();
    safeSend({ type: "clear" });
  });

  eraserTool.addEventListener("click", toggleEraserMode);

  // Pointer events for mouse, pen, and touch
  canvas.addEventListener("pointerdown", startDrawing);
  canvas.addEventListener("pointermove", draw);
  canvas.addEventListener("pointerup", stopDrawing);
  canvas.addEventListener("pointercancel", stopDrawing);
  canvas.addEventListener("pointerout", stopDrawing);

  function updateUserDrawer(username) {
    const userInfoElement = document.getElementById("user-info");
    userInfoElement.innerHTML = "";
    const ul = document.createElement("ul");
    ul.textContent = `Drawer: ${username}`;
    userInfoElement.appendChild(ul);
  }

  function getPosFromPointerEvent(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function getPosFromTouchEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const t = e.touches && e.touches[0] ? e.touches[0] : (e.changedTouches && e.changedTouches[0]);
    return t ? { x: t.clientX - rect.left, y: t.clientY - rect.top } : { x: lastX, y: lastY };
  }

  function startDrawing(e) {
    e.preventDefault();
    isDrawing = true;
    if (e.pointerId !== undefined && canvas.setPointerCapture) {
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    }
    const pos = e.touches ? getPosFromTouchEvent(e) : getPosFromPointerEvent(e);
    lastX = pos.x; lastY = pos.y;
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
  }

  function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = e.touches ? getPosFromTouchEvent(e) : getPosFromPointerEvent(e);
    const x = pos.x; const y = pos.y;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = parseInt(currentBrushSize, 10) || 4;

    if (eraserTool.checked) {
      ctx.globalCompositeOperation = "destination-out";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = currentColor;
    }

    const message = eraserTool.checked
      ? { type: "erase", x, y, size: ctx.lineWidth, color: "#ffffff" }
      : { type: "draw", username, x, y, color: currentColor, size: ctx.lineWidth };

    safeSend(message);

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.globalCompositeOperation = "source-over";
    lastX = x; lastY = y;
  }

  function stopDrawing(e) {
    isDrawing = false;
    if (e && e.pointerId !== undefined && canvas.releasePointerCapture) {
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    ctx.beginPath();
    safeSend({ type: "stopDrawing" });
  }

  function clearCanvas() {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
  }

  // Touch event fallbacks
  canvas.addEventListener("touchstart", (e) => { startDrawing(e); }, { passive: false });
  canvas.addEventListener("touchmove", (e) => { draw(e); }, { passive: false });
  canvas.addEventListener("touchend", (e) => { stopDrawing(e); }, { passive: false });
  canvas.addEventListener("touchcancel", (e) => { stopDrawing(e); }, { passive: false });

  for (let i = 2; i <= 6; i++) {
    const option = document.createElement("option");
    option.value = i;
    option.textContent = i;
    brushSizeSelector.appendChild(option);
  }

  function saveCanvas() {
    const filename = prompt("Name your drawing file:");
    if (filename) {
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${filename}.png`;
      link.click();
    } else {
      alert("Filename is required.");
    }
  }

  function handleFileInputChange(event) {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = function (e) {
      const img = new Image();
      img.onload = function () {
        ctx.drawImage(img, 0, 0);
        const imageData = canvas.toDataURL("image/png");
        safeSend({ type: "loadImage", imageData });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
});
