const express = require('express');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const http = require('http');
const cors = require('cors'); // <- npm i cors

const app = express();

// CORS for your Vercel frontend (adjust origin to your domain if you want to lock it down)
// app.use(cors({ origin: 'https://collaborative-whiteboard-tau.vercel.app' }));
app.use(cors({ origin: true }));

// allow big base64 images
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
  wss.clients.forEach(c => c.readyState === WebSocket.OPEN && c.send(msg));
}

function broadcastClearCanvas(wss) {
  const msg = JSON.stringify({ type: 'clear' });
  wss.clients.forEach(c => c.readyState === WebSocket.OPEN && c.send(msg));
}

function sendDrawingDataToNewUser(ws) {
  drawingData.forEach(d => ws.send(JSON.stringify(d)));
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
  wss.clients.forEach(client => {
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

// Disable perMessageDeflate (helps with some proxies) and prepare for heartbeats
const wss = new WebSocket.Server({ server, perMessageDeflate: false });

/** ---------- Heartbeat / keep-alive ---------- **/
function noop() {}
function markAlive() { this.isAlive = true; }

// terminate dead sockets, ping alive ones every 30s
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping(noop);
  });
}, 30_000);

wss.on('close', () => clearInterval(heartbeatInterval));
/** ------------------------------------------- **/

wss.on('connection', (ws) => {
  const id = generateId();
  console.log('Client connected', id);

  // mark connection alive and listen for low-level pongs
  ws.isAlive = true;
  ws.on('pong', markAlive);

  ws.on('message', (message) => {
    let parsed;
    try {
      parsed = JSON.parse(message);
    } catch {
      return; // ignore malformed frames
    }

    // respond to app-level ping (from the browser) if you send them
    if (parsed.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong' }));
      return;
    }

    if (parsed.type === 'newUser') {
      const { username } = parsed;
      connectedUsers.push({ id, username });
      broadcastUserList(wss);
      sendDrawingDataToNewUser(ws);

    } else if (parsed.type === 'draw') {
      // broadcast draw & active drawer name
      wss.clients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(parsed));
        }
      });
      currentDrawerUsername = parsed.username;
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'drawerUsername', username: currentDrawerUsername }));
        }
      });
      drawingData.push(parsed);

    } else if (parsed.type === 'erase' || parsed.type === 'stopDrawing') {
      wss.clients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(parsed));
        }
      });
      drawingData.push(parsed);

    } else if (parsed.type === 'clear') {
      broadcastClearCanvas(wss);
      drawingData.push(parsed);

    } else if (parsed.type === 'chatMessage') {
      wss.clients.forEach(client => {
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
