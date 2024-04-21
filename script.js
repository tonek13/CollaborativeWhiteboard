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
    let currentBrushSize = brushSizeSelector.value;
    let isDrawing = false;
    let username = null;
    

    const socket = new WebSocket('ws://localhost:5500');

    // Open WebSocket connection and prompt for username
    socket.addEventListener('open', () => {
        console.log('WebSocket connection established');
        // Prompt the user to enter their username when connected
        promptForUsername();
    });

    function sendMessage() {
        const message = messageInput.value.trim();
        if (message) {
            const data = {
                type: 'chatMessage',
                username: username,
                message: message
            };
            socket.send(JSON.stringify(data));
            // Clear the message input field after sending the message
            messageInput.value = '';
        }
    }
    sendMessageButton.addEventListener("click", sendMessage);

    function promptForUsername() {
        username = prompt("Please enter your username:");
        if (username) {
            socket.send(JSON.stringify({ type: 'newUser', username: username }));
        } else {
            console.log('Username not provided.');
        }
    }

    canvas.addEventListener("mousedown", () => {
        if (username) {
            socket.send(JSON.stringify({ type: 'username', username: username }));
        }
    });

    disconnectButton.addEventListener("click", () => {
        socket.close(1000, "User disconnected");
    });

    fileInput.addEventListener('change', handleFileInputChange);
    saveButton.addEventListener('click', saveCanvas);

    socket.addEventListener('close', (event) => {
        if (event.wasClean) {
            console.log(`WebSocket connection closed cleanly, code: ${event.code}, reason: ${event.reason}`);
            alert('You have been disconnected from the server');
        } else {
            console.error(`WebSocket connection abruptly closed, code: ${event.code}, reason: ${event.reason}`);
            alert('Connection lost. Please check your network connection and try reconnecting');
        }
        
    });

    document.getElementById('refreshButton').addEventListener('click', () => {
        // Send a message to the server requesting all drawing data
        socket.send(JSON.stringify({ type: 'requestAllDrawingData' }));
    });
    
    
    socket.addEventListener('error', (error) => {
        console.error('WebSocket error:', error);
        // Display an error message to the user
        alert('WebSocket error occurred. Please check your connection and try again.');
    });

    

    socket.addEventListener('message', (event) => {
        try {
            const message = JSON.parse(event.data);
            if (message.type === 'draw') {
                handleDrawing(message);
            } else if (message.type === 'userListUpdate') {
                updateUserList(message.users);
            } else if (message.type === 'stopDrawing') {
                ctx.beginPath();
            } else if (message.type === 'erase'){
                erase(message);
            } else if (message.type === 'clear') {
                clearCanvas();
            } else if (message.type === 'drawerUsername') {
                updateUserDrawer(message.username);
            }else if (message.type === 'chatMessage') {
                displayChatMessage(message.username, message.message);
            }else if (message.type === 'chatMessage') {
                displayChatMessage(message.username, message.message);
            }else  if (message.type === 'drawingData') {
                handleDrawingData(message.data);
            }
        } catch (error) {
            console.error('Error parsing JSON message:', error);
        }
    });

    function handleDrawingData(data) {
        // Iterate over the drawing data and draw each line on the canvas
        data.forEach((line) => {
            // Draw the line using line coordinates, color, etc.
        });
    }

    function displayChatMessage(username, message) {
        const chatBox = document.getElementById('chat');
        const messageElement = document.createElement('div');
        messageElement.textContent = `${username}: ${message}`;
        chatBox.appendChild(messageElement);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function handleDrawing(message) {
        const { type, x, y, color, size } = message;
        ctx.strokeStyle = color;
        ctx.lineWidth = size;
        ctx.lineCap = "round";
        if (type === 'drawStart') {
            ctx.beginPath();
            ctx.moveTo(x, y);
        } else if (type === 'draw') {
            ctx.lineTo(x, y);
            ctx.stroke();
        }
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
        if (drawingTool.checked) {
            toggleDrawingMode();
        } else {
            toggleEraserMode();
        }
    });

    eraserTool.addEventListener("change", () => {
        if (eraserTool.checked) {
            toggleEraserMode();
        } else {
            toggleDrawingMode();
        }
    });

    // Function to update user list in HTML
    function updateUserList(users) {
        const userListElement = document.getElementById('userList');
        userListElement.innerHTML = '';
        users.forEach((user) => {
            const listItem = document.createElement('li');
            // Display both ID and username in the list item
            listItem.textContent = `ID: ${user.id}, Username: ${user.username}`;
            userListElement.appendChild(listItem);
        });
    }


    colorPicker.addEventListener("input", () => {
        currentColor = colorPicker.value;
    });

    brushSizeSelector.addEventListener("change", () => {
        currentBrushSize = brushSizeSelector.value;
    });

    clearButton.addEventListener("click", () => {
        clearCanvas();
        socket.send(JSON.stringify({ type: 'clear' }));
    });

    eraserTool.addEventListener("click", toggleEraserMode);

    canvas.addEventListener("mousedown", startDrawing);
    canvas.addEventListener("mousemove", draw);
    canvas.addEventListener("mousemove", erase);
    canvas.addEventListener("mouseup", stopDrawing);
    canvas.addEventListener("mouseout", stopDrawing);

    function updateUserDrawer(username) {
        const userInfoElement = document.getElementById('user-info');
        userInfoElement.innerHTML = ''; // Clear previous content
        const listItem = document.createElement('ul');
        listItem.textContent = `Drawer: ${username}`;
        userInfoElement.appendChild(listItem);
    }

    function startDrawing(e) {
        isDrawing = true;
        draw(e);
    }

    function erase(e) {
        if (!isDrawing) return;
        ctx.strokeStyle = 'white';
        ctx.lineWidth = currentBrushSize;
        ctx.beginPath();
        ctx.fillStyle = '#ffffff';
        ctx.arc(e.offsetX, e.offsetY, currentBrushSize / 2, 0, Math.PI * 2);
        ctx.fill();
        const message = {
            type: 'erase',
            x: e.offsetX,
            y: e.offsetY,
            size: currentBrushSize,
            color: '#ffffff'
        };
        socket.send(JSON.stringify(message));
    }

    function draw(e) {
        if (!isDrawing) return;
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = currentBrushSize;
        if (eraserTool.checked) {
            ctx.globalCompositeOperation = "destination-out";
        } else {
            ctx.globalCompositeOperation = "source-over";
        }
        const message = {
            type: 'draw',
            username: username,
            x: e.offsetX,
            y: e.offsetY,
            color: currentColor,
            size: currentBrushSize
        };
        socket.send(JSON.stringify(message));
        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(e.offsetX, e.offsetY);
        ctx.globalCompositeOperation = "source-over";
    }

    function stopDrawing() {
        isDrawing = false;
        ctx.beginPath();
        const message = JSON.stringify({ type: 'stopDrawing' });
        socket.send(message);
    }

    function clearCanvas() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    for (let i = 2; i <= 6; i++) {
        const option = document.createElement("option");
        option.value = i;
        option.textContent = i;
        brushSizeSelector.appendChild(option);
    }

    function saveCanvas() {
        // Prompt the user to enter the filename
        const filename = prompt("Name your drawing file:");
        if (filename) {
            const dataUrl = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = `${filename}.png`; // Use the provided filename
            link.click();
        } else {
            // Inform the user that the filename is required
            alert("Filename is required.");
        }
    }
    // Function to handle file input change
    function handleFileInputChange(event) {
        const file = event.target.files[0];
        const reader = new FileReader();
        reader.onload = function (e) {
            const img = new Image();
            img.onload = function () {
                ctx.drawImage(img, 0, 0);
                // Get the image data from the canvas
                const imageData = canvas.toDataURL('image/png');
                // Send the image data to the server
                socket.send(JSON.stringify({ type: 'loadImage', imageData: imageData }));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
    



});