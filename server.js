const express = require('express');
const bodyParser = require('body-parser');
const WebSocket = require('ws');

const app = express();
const port = 5500;

app.use(bodyParser.json());

let connectedUsers = [];
let drawingData = [];

function generateId() {
    return Date.now().toString();
}

function broadcastUserList() {
    const userListWithIdAndUsername = connectedUsers.map(user => {
        return {
            id: user.id,
            username: user.username
        };
    });

    const userListMessage = JSON.stringify({
        type: 'userListUpdate',
        users: userListWithIdAndUsername
    });

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(userListMessage);
        }
    });
}

function broadcastClearCanvas() {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'clear' }));
        }
    });
}

function sendDrawingDataToNewUser(newUserSocket) {
    drawingData.forEach((data) => {
        newUserSocket.send(JSON.stringify(data));
    });
}

function sendAllDrawingDataToClient(clientSocket) {
    const message = {
        type: 'drawingData',
        data: drawingData
    };
    clientSocket.send(JSON.stringify(message));
}


const wss = new WebSocket.Server({ noServer: true });

    wss.on('connection', (ws) => {
    console.log('Client connected');

    const id = generateId();

    ws.on('message', (message) => {
        const parsedMessage = JSON.parse(message);

        if (parsedMessage.type === 'newUser') {
            const { username } = parsedMessage;
            console.log('Received username:', username);
            const newUser = { id, username };
            connectedUsers.push(newUser);
            console.log(connectedUsers);
            broadcastUserList();
            sendDrawingDataToNewUser(ws);
        } else if (parsedMessage.type === 'draw') {
            wss.clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(parsedMessage));
                }
            });
            currentDrawerUsername = parsedMessage.username;

            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'drawerUsername', username: currentDrawerUsername }));
                }
            });
            drawingData.push(parsedMessage);
        } else if (parsedMessage.type === 'erase') {
            wss.clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(parsedMessage));
                }
            });
            drawingData.push(parsedMessage);
        } else if (parsedMessage.type === 'stopDrawing') {
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(parsedMessage));
                }
            });
            drawingData.push(parsedMessage);
        } else if (parsedMessage.type === 'clear') {
            broadcastClearCanvas();
            drawingData.push(parsedMessage);
        }else if (parsedMessage.type === 'chatMessage') {
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                        type: 'chatMessage',
                        username: parsedMessage.username,
                        message: parsedMessage.message
                    }));
                }
            });
        }else if (parsedMessage.type === 'requestAllDrawingData') {
            sendAllDrawingDataToClient(ws);
        }
    });

    app.post('/save-drawing', (req, res) => {
    const imageData = req.body.imageData;
    let imageName = req.query.filename || 'drawing_' + Date.now() + '.png';

    if (!imageName.endsWith('.png')) {
        imageName += '.png';
    }

    res.setHeader('Content-Disposition', `attachment; filename=${imageName}`);
    res.setHeader('Content-Type', 'image/png');
    res.send(imageData);
    
});

    app.post('/load-image', (req, res) => {
    const imageData = req.body.imageData;
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'loadImage', imageData: imageData }));
        }
    });
    drawingData.push(imageData);
    res.status(200).send('Image loaded successfully.');
    
});




    ws.on('close', (code, reason) => {
    if (reason && reason.length > 0) {
        console.log('Client disconnected:', code, reason.toString());
    } else {
        console.log('Client disconnected:', code, 'No reason provided');
    }

    const disconnectedUserIndex = connectedUsers.findIndex(user => user.id === id);
    if (disconnectedUserIndex !== -1) {
        connectedUsers.splice(disconnectedUserIndex, 1);
    }
    broadcastUserList();
});



});

const server = app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});

server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

