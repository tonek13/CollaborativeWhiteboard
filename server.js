const express = require('express');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const http = require('http');

const app = express();
// allow big base64 images, adjust as you like
app.use(bodyParser.json({ limit: '10mb' }));

const PORT = process.env.PORT || 5500;

// --- in-memory state ---
let connectedUsers = [];
let drawingData = [];
let currentDrawerUsername = null;

// --- helpers ---
function generateId() {
  return Date.now().toString();
}

function broadcastUserList(wss) {
  const users = connectedUsers.map(u => ({ id: u.id, username: u.username }));
  const msg = JSON.stringify({ type: 'userListUpdate', users });
  wss.clients.forEach((c) => c.readyState === WebSocket.OPEN && c.send(msg));
}

function broadcastClearCanvas(wss) {
  const msg = JSON.stringify({ type: 'clear' });
  wss.clients.forEach((c) => c.readyState === WebSocket.OPEN && c.send(msg));
}

function sendDrawingDataToNewUser(ws) {
  drawingData.forEach((d) => ws.send(JSON.stringify(d)));
}

function sendAllDrawingDataToClient(ws) {
  ws.send(JSON.stringify({ type: 'drawingData', data: drawingData }));
}

// --- HTTP endpoints (optional) ---
app.post('/save-drawing', (req, res) => {
  const imageData = req.body.imageData;
  let imageName = req.query.filename || ('drawing_' + Date.now() + '.png');
  if (!imageName.endsWith('.png')) imageName += '.png';

  res.setHeader('Content-Disposition', `attachment; filename=${imageName}`);
  res.setHeader('Content-Type', 'image/png');
  res.send(imageData);
});

app.post('/load-image', (req, res) => {
  const imageData = req.body.imageData;
  // broadcast to all clients as a loadImage event
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'loadImage', imageData }));
    }
  });
  // keep a record so new users can replay
  drawingData.push({ type: 'loadImage', imageData });
  res.status(200).send('Image loaded successfully.');
});

// --- create HTTP server & attach WS server ---
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  const id = generateId();
  console.log('Client connected', id);

  ws.on('message', (message) => {
    const parsed = JSON.parse(message);

    if (parsed.type === 'newUser') {
      const { username } = parsed;
      connectedUsers.push({ id, username });
      broadcastUserList(wss);
      sendDrawingDataToNewUser(ws);

    } else if (parsed.type === 'draw') {
      // broadcast draw & active drawer name
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(parsed));
        }
      });
      currentDrawerUsername = parsed.username;
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'drawerUsername', username: currentDrawerUsername }));
        }
      });
      drawingData.push(parsed);

    } else if (parsed.type === 'erase' || parsed.type === 'stopDrawing') {
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(parsed));
        }
      });
      drawingData.push(parsed);

    } else if (parsed.type === 'clear') {
      broadcastClearCanvas(wss);
      drawingData.push(parsed);

    } else if (parsed.type === 'chatMessage') {
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'chatMessage', username: parsed.username, message: parsed.message }));
        }
      });

    } else if (parsed.type === 'requestAllDrawingData') {
      sendAllDrawingDataToClient(ws);
    }
  });

  ws.on('close', (code, reason) => {
    console.log('Client disconnected:', id, code, reason?.toString() || '');
    const idx = connectedUsers.findIndex(u => u.id === id);
    if (idx !== -1) connectedUsers.splice(idx, 1);
    broadcastUserList(wss);
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
