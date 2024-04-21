const express = require('express');
const bodyParser = require('body-parser');
const WebSocket = require('ws');

const app = express();
const port = 5500;

app.use(bodyParser.json());

// Array to store connected users
let connectedUsers = [];
let drawingData = [];

// Function to generate a unique ID for WebSocket connections
function generateId() {
    return Date.now().toString();
}

// Function to broadcast updated user list to all clients
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

// Function to broadcast clear canvas message to all clients
function broadcastClearCanvas() {
    // Broadcast clear message to all clients
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
    // Construct a message containing all drawing data
    const message = {
        type: 'drawingData',
        data: drawingData // Assuming drawingData is an array containing all drawing data
    };
    // Send the message to the client
    clientSocket.send(JSON.stringify(message));
}

// WebSocket setup
const wss = new WebSocket.Server({ noServer: true });


// Handle WebSocket connection
    wss.on('connection', (ws) => {
    console.log('Client connected');

    // Generate a unique ID for this WebSocket connection
    const id = generateId();

    // Event listener for incoming messages
    ws.on('message', (message) => {
        const parsedMessage = JSON.parse(message);

        // Check message type
        if (parsedMessage.type === 'newUser') {
            const { username } = parsedMessage; // Extract username from the message
            console.log('Received username:', username); // Log the received username
            const newUser = { id, username };
            connectedUsers.push(newUser);
            console.log(connectedUsers);
            // Broadcast updated user list to all clients
            broadcastUserList();
            sendDrawingDataToNewUser(ws);
        } else if (parsedMessage.type === 'draw') {
            // Broadcast drawing data to all clients except the sender
            wss.clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(parsedMessage));
                }
            });
            // Update the current drawer's username
            currentDrawerUsername = parsedMessage.username;

            // Broadcast the current drawer's username to all clients
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'drawerUsername', username: currentDrawerUsername }));
                }
            });
            drawingData.push(parsedMessage);
        } else if (parsedMessage.type === 'erase') {
            // Broadcast erasing data to all clients except the sender
            wss.clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(parsedMessage));
                }
            });
            drawingData.push(parsedMessage);
        } else if (parsedMessage.type === 'stopDrawing') {
            // Broadcast stopDrawing message to all clients
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(parsedMessage));
                }
            });
            drawingData.push(parsedMessage);
        } else if (parsedMessage.type === 'clear') {
            // Call the function to broadcast clear canvas message to all clients
            broadcastClearCanvas();
            drawingData.push(parsedMessage);
        }else if (parsedMessage.type === 'chatMessage') {
            // Broadcast chat message to all clients
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
            // If the message requests all drawing data, send it to the client
            sendAllDrawingDataToClient(ws);
        }
    });

   // Express route to handle saving a drawing
    app.post('/save-drawing', (req, res) => {
    const imageData = req.body.imageData; // Assuming the client sends the image data
    let imageName = req.query.filename || 'drawing_' + Date.now() + '.png'; // Use provided filename or generate a unique one

    // Make sure the filename has a .png extension
    if (!imageName.endsWith('.png')) {
        imageName += '.png';
    }

    // Set the content disposition header to trigger download
    res.setHeader('Content-Disposition', `attachment; filename=${imageName}`);
    // Set content type to image/png
    res.setHeader('Content-Type', 'image/png');
    // Send the image data as the response
    res.send(imageData);
    
});

 // Express route to handle loading an image
    app.post('/load-image', (req, res) => {
    const imageData = req.body.imageData;
    // Broadcast the loaded image data to all clients
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

    // Find the disconnected user in the connectedUsers array and remove them
    const disconnectedUserIndex = connectedUsers.findIndex(user => user.id === id);
    if (disconnectedUserIndex !== -1) {
        connectedUsers.splice(disconnectedUserIndex, 1);
    }

    // Broadcast updated user list to all clients
    broadcastUserList();
});



});

// Start the server
const server = app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});

// Upgrade HTTP server to WebSocket server
server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

