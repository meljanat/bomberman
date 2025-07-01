const http = require('http');
const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');

const staticFiles = path.join(__dirname, 'public');

const server = http.createServer(async (req, res) => {
    try {
        let filePath = req.url;
        filePath = path.join(staticFiles, filePath === '/' ? '/index.html' : filePath);

        if (!filePath.startsWith(staticFiles)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            return res.end('Forbidden');
        }

        try {
            await fs.access(filePath);
        } catch {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('404 Not Found');
        }

        const contentType = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'text/javascript',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif'
        }[path.extname(filePath)] || 'text/plain';

        const data = await fs.readFile(filePath);
        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end(data);
    } catch (err) {
        console.error('Error handling request:', err);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
    }
});

const wss = new WebSocket.Server({ server });

// Game state
let players = [];
let bombs = [];
let gridSize = 11;
let messages = []
let board = [
    [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
    [2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2],
    [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
    [2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2],
    [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
    [2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2],
    [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
    [2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2],
    [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
    [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
];

const positions = [
    { x: 1, y: 1 },
    { x: 9, y: 9 },
    { x: 1, y: 9 },
    { x: 9, y: 1 },
];

let gameStarted = false ;

const powers = { "speed": 1, "flames": 1, "bombs": 1 };

// Store player WebSocket connections
let playerConnections = new Map();

wss.on('connection', (ws) => {
    // console.log('A new player connected.');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            // console.log('Received message:', data);

            if (data.type === 'start') {
                handlePlayerJoin(ws, data.name);
            } else if (data.type === 'move') {
                const player = getPlayerByWebSocket(ws);
                if (player) {
                    handlePlayerMove(player, data.direction);
                }
            } else if (data.type === 'placeBomb') {
                const player = getPlayerByWebSocket(ws);
                if (player) {
                    handlePlaceBomb(player);
                }
            } else if (data.type === 'leaveGame') {
                const player = getPlayerByWebSocket(ws);
                if (player) {
                    playerConnections.delete(player.id)
                    // console.log(playerConnections);
                    players = players.filter(a => a.id != player.id)
                    if (players.length <2) {
                        checkGameOver();
                    }

                    // console.log(player.name, "----++++++");

                }
            } else if (data.type === 'message') {
                const player = getPlayerByWebSocket(ws);
                if (player) {
                    handleChatMessage(player, data.message);
                }
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });

    ws.on('close', () => {
        // console.log('A player disconnected.');
        let player = getPlayerByWebSocket(ws);
        if (player) {
            players = players.filter((p) => p.id !== player.id);
            playerConnections.delete(player.id);
            broadcast(JSON.stringify({ type: 'playerLeft', players }));

            // Check for game over
            checkGameOver();
        }
    });

    ws.on('error', (error) => {
        // console.error('WebSocket error:', error);
    });
});

function handleChatMessage(player, messageText) {
    if (!messageText || typeof messageText !== 'string') {
        return;
    }

    messageText = messageText.trim();
    if (messageText.length === 0 || messageText.length > 100) {
        return;
    }

    const message = {
        id: Date.now(),
        playerId: player.id,
        sender: player.name,
        text: messageText,
        timestamp: Date.now()
    };

    messages.push(message);
    if (messages.length > 20) {
        messages.shift();
    }

    broadcast(JSON.stringify({
        type: 'newMessage',
        message: message,
        messages: messages,
        sender : player.name
    }));
}

function handlePlayerJoin(ws, name) {
    // Check if room is full
    if (players.length >= 4 || gameStarted) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room is already full.' }));
        return;
    }

    // Validate name
    const nameValidation = checkName(name);
    if (!nameValidation[0]) {
        ws.send(JSON.stringify({ type: 'error', message: nameValidation[1] }));
        return;
    }

    // Create new player
    const playerId = Date.now(); // Use timestamp for unique ID
    const playerPosition = positions[players.length]; // Use array length for position

    const player = {
        id: playerId,
        x: playerPosition.x,
        y: playerPosition.y,
        lives: 3,
        name: name,
        powers: powers,
        bombs: 0
    };

    players.push(player);
    playerConnections.set(playerId, ws);

    // console.log(`Player ${name} joined. Total players: ${players.length}`);

    // Add blocks on first player join
    if (players.length === 1) {
        addBlocks();
    }

    // Check if we can start the game
    if (players.length >= 2) {
        // Start the game immediately when we have 2+ players
        gameStarted = true
        broadcast(JSON.stringify({
            type: 'init',
            board,
            players,
            bombs
        }));
    } else {
        // Send waiting message
        broadcast(JSON.stringify({
            type: 'waiting',
            message: `Currently in room: ${players.length}/4. Waiting for more players...`
        }), player.id);
    }
    if (messages.length > 0) {
        playerConnections.get(playerId).send(JSON.stringify({
            type: 'messageHistory',
            messages: messages
        }));
    }
}

function getPlayerByWebSocket(ws) {
    for (const [playerId, playerWs] of playerConnections) {
        if (playerWs === ws) {
            return players.find(p => p.id === playerId);
        }
    }
    return null;
}

function addBlocks() {
    // Clear the board first (keep walls)
    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            if (board[i][j] === 1) {
                board[i][j] = 0;
            }
        }
    }

    // Add destructible blocks randomly
    for (let i = 1; i < gridSize - 1; i++) {
        for (let j = 1; j < gridSize - 1; j++) {
            if (board[i][j] === 0) {
                // Don't place blocks too close to starting positions
                const isNearStart = positions.some(pos =>
                    Math.abs(pos.x - j) <= 1 && Math.abs(pos.y - i) <= 1
                );

                if (!isNearStart && Math.random() < 0.6) {
                    board[i][j] = 1;
                }
            }
        }
    }
}

function checkName(name) {
    if (!name || !name.trim()) {
        return [false, 'Name cannot be empty.'];
    }

    if (name.length > 20) {
        return [false, 'Name must be less than 20 characters long.'];
    }
    if (players.some((p) => p.name === name)) {
        return [false, 'Name is already taken.'];
    }

    return [true, ''];
}

function broadcast(message, id) {
    //console.log('Broadcasting:', message);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && (!id || playerConnections.get(id) == client)) {
            client.send(message);
        }
    });
}

function handlePlayerMove(player, direction) {
    let newX = player.x;
    let newY = player.y;

    if (direction === 'up' && checkTile(newX, newY - 1)) newY -= player.powers.speed;
    else if (direction === 'down' && checkTile(newX, newY + 1)) newY += player.powers.speed;
    else if (direction === 'left' && checkTile(newX - 1, newY)) newX -= player.powers.speed;
    else if (direction === 'right' && checkTile(newX + 1, newY)) newX += player.powers.speed;

    if (newX !== player.x || newY !== player.y) {
        player.x = newX;
        player.y = newY;
        broadcast(JSON.stringify({ type: 'playerMoved', players, powers }));
    }
}

function checkTile(x, y) {
    if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) return false;
    if (board[y][x] === 2 || board[y][x] === 1) return false; // wall or block

    // Check if there's already a bomb here
    const hasBomb = bombs.some(bomb => bomb.x === x && bomb.y === y);
    if (hasBomb) return false;

    return true;
}

function handlePlaceBomb(player) {
    // Check if player already has a bomb at this position
    const existingBomb = bombs.find(bomb => bomb.x === player.x && bomb.y === player.y);
    if (existingBomb || player.bombs >= player.powers.bombs) return;

    const bomb = {
        x: player.x,
        y: player.y,
        playerId: player.id,
        timestamp: Date.now()
    };

    bombs.push(bomb);
    player.bombs++

    broadcast(JSON.stringify({ type: 'bombPlaced', bombs }));

    setTimeout(() => {
        explodeBomb(bomb, player);
    }, 2000);

    setTimeout(() => {
        player.bombs = 0;
    }, 3000);
}

function explodeBomb(bomb, player) {
    // Remove the bomb from the array
    bombs = bombs.filter((b) => b !== bomb);

    // Calculate explosion positions
    let explosions = [
        { x: bomb.x, y: bomb.y }
    ];

    // Add cross-shaped explosion (up, down, left, right)
    const directions = [
        { dx: 0, dy: -player.powers.flames}, // up
        { dx: 0, dy: player.powers.flames },  // down
        { dx: -player.powers.flames, dy: 0 }, // left
        { dx: player.powers.flames, dy: 0 }   // right
    ];

    directions.forEach(dir => {
        const explX = bomb.x + dir.dx;
        const explY = bomb.y + dir.dy;

        if (explX >= 0 && explX < gridSize && explY >= 0 && explY < gridSize) {
            if (board[explY][explX] !== 2) { // Not a wall
                explosions.push({ x: explX, y: explY });

                // Destroy blocks
                if (board[explY][explX] === 1) {
                    board[explY][explX] = 0;
                }
            }
        }
    });

    // Check which players are hit by explosion
    players.forEach((player) => {
        const hit = explosions.some(expl =>
            player.x === expl.x && player.y === expl.y
        );
        if (hit) {
            player.lives--;
        }
    });

    // Remove dead players
    players = players.filter((player) => player.lives > 0);

    broadcast(JSON.stringify({
        type: 'bombExploded',
        players,
        board,
        bombs,
        explosions
    }));

    // Check for game over
    setTimeout(() => {
        checkGameOver();
    }, 1000);
}

function checkGameOver() {
    const alivePlayers = players.filter(p => p.lives > 0);
    if (alivePlayers.length <= 1) {
        const winner = alivePlayers.length === 1 ? alivePlayers[0].name : null;
        broadcast(JSON.stringify({
            type: 'gameOver',
            winner: winner
        }));

        // Reset game after 5 seconds
        setTimeout(() => {
            resetGame();
        }, 5000);
    }
}

function resetGame() {
    players = [];
    bombs = [];
    messages = [];
    gameStarted = false
    playerConnections.clear();

    // Reset board
    board = [
        [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
        [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
        [2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2],
        [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
        [2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2],
        [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
        [2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2],
        [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
        [2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2],
        [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
        [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    ];
}

// Start the server
const PORT = 8888;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
}); resetGame