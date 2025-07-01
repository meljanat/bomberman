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
let powerUps = [];
let chatMessages = [];
let gridSize = 11;
let gameState = 'waiting'; // 'waiting', 'countdown', 'playing', 'ended'
let gameStartTimer = null;
let countdownTimer = null;
let countdownSeconds = 10;

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
    console.log('A new player connected.');
    
    // Send current chat messages to new player
    ws.send(JSON.stringify({ 
        type: 'chatHistory', 
        messages: chatMessages.slice(-50) // Send last 50 messages
    }));
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            // console.log('Received message:', data);

            if (data.type === 'start') {
                handlePlayerJoin(ws, data.name);
            } else if (data.type === 'move') {
                const player = getPlayerByWebSocket(ws);
                if (player && gameState === 'playing') {
                    handlePlayerMove(player, data.direction);
                }
            } else if (data.type === 'placeBomb') {
                const player = getPlayerByWebSocket(ws);
                if (player && gameState === 'playing') {
                    handlePlaceBomb(player);
                }
            } else if (data.type === 'chat') {
                const player = getPlayerByWebSocket(ws);
                if (player) {
                    handleChatMessage(player, data.message);
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
            
            // Reset timers if not enough players
            if (players.length < 2) {
                clearGameTimers();
                gameState = 'waiting';
                broadcast(JSON.stringify({ type: 'gameState', state: gameState }));
            }

            // Check for game over
            if (gameState === 'playing') {
                checkGameOver();
            }
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
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
        lives: 3,
        bombCount: 1,     // How many bombs can be placed at once
        flameSize: 1,     // Explosion range
        speed: 1,         // Movement speed multiplier
        powerUps: {
            bombPass: false,
            blockPass: false,
            detonator: false
        }
    };

    players.push(player);
    playerConnections.set(playerId, ws);

    // console.log(`Player ${name} joined. Total players: ${players.length}`);

    // Add blocks on first player join
    if (players.length === 1) {
        addBlocks();
    }

    // Broadcast player joined
    broadcast(JSON.stringify({ type: 'playerJoined', players }));

    // Handle game start logic
    if (players.length >= 2) {
        if (players.length === 4) {
            // Start countdown immediately with 4 players
            startCountdown();
        } else if (!gameStartTimer) {
            // Start 20-second timer for 2-3 players
            gameStartTimer = setTimeout(() => {
                if (players.length >= 2) {
                    startCountdown();
                }
            }, 20000);
        }
    }

    // Send current game state
    ws.send(JSON.stringify({ 
        type: 'gameState', 
        state: gameState,
        players,
        board,
        bombs,
        powerUps,
        countdown: countdownSeconds
    }));
}

function startCountdown() {
    clearGameTimers();
    gameState = 'countdown';
    countdownSeconds = 10;
    
    broadcast(JSON.stringify({ 
        type: 'countdown', 
        seconds: countdownSeconds 
    }));

    countdownTimer = setInterval(() => {
        countdownSeconds--;
        broadcast(JSON.stringify({ 
            type: 'countdown', 
            seconds: countdownSeconds 
        }));

        if (countdownSeconds <= 0) {
            clearInterval(countdownTimer);
            startGame();
        }
    }, 1000);
}

function startGame() {
    gameState = 'playing';
    broadcast(JSON.stringify({ 
        type: 'gameStart',
        board, 
        players, 
        bombs,
        powerUps
    }));
}

function clearGameTimers() {
    if (gameStartTimer) {
        clearTimeout(gameStartTimer);
        gameStartTimer = null;
    }
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
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

function handleChatMessage(player, message) {
    if (!message || message.trim().length === 0) return;
    
    const chatMessage = {
        id: Date.now(),
        playerId: player.id,
        playerName: player.name,
        message: message.trim(),
        timestamp: new Date().toISOString()
    };
    
    chatMessages.push(chatMessage);
    
    // Keep only last 100 messages
    if (chatMessages.length > 100) {
        chatMessages = chatMessages.slice(-100);
    }
    
    broadcast(JSON.stringify({ type: 'chatMessage', chatMessage }));
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

    if (direction === 'up' && checkTile(newX, newY - 1, player)) newY -= 1;
    else if (direction === 'down' && checkTile(newX, newY + 1, player)) newY += 1;
    else if (direction === 'left' && checkTile(newX - 1, newY, player)) newX -= 1;
    else if (direction === 'right' && checkTile(newX + 1, newY, player)) newX += 1;

    if (newX !== player.x || newY !== player.y) {
        player.x = newX;
        player.y = newY;
        
        // Check for power-up collection
        checkPowerUpCollection(player);
        
        broadcast(JSON.stringify({ type: 'playerMoved', players, powers }));
    }
}

function checkTile(x, y, player) {
    if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) return false;
    
    // Check walls
    if (board[y][x] === 2) return false;
    
    // Check blocks (unless player has block pass)
    if (board[y][x] === 1 && !player.powerUps.blockPass) return false;

    // Check bombs (unless player has bomb pass)
    const hasBomb = bombs.some(bomb => bomb.x === x && bomb.y === y);
    if (hasBomb) return false;

    if (hasBomb && !player.powerUps.bombPass) return false;
    
    return true;
}

function checkPowerUpCollection(player) {
    const powerUpIndex = powerUps.findIndex(powerUp => 
        powerUp.x === player.x && powerUp.y === player.y
    );
    
    if (powerUpIndex !== -1) {
        const powerUp = powerUps[powerUpIndex];
        applyPowerUp(player, powerUp);
        powerUps.splice(powerUpIndex, 1);
        broadcast(JSON.stringify({ type: 'powerUpCollected', players, powerUps }));
    }
}

function applyPowerUp(player, powerUp) {
    switch (powerUp.type) {
        case 'bombs':
            player.bombCount++;
            break;
        case 'flames':
            player.flameSize++;
            break;
        case 'speed':
            player.speed = Math.min(player.speed + 0.5, 3); // Max speed 3x
            break;
        case 'bombPass':
            player.powerUps.bombPass = true;
            break;
        case 'blockPass':
            player.powerUps.blockPass = true;
            break;
        case 'detonator':
            player.powerUps.detonator = true;
            break;
        case 'oneUp':
            player.lives++;
            break;
    }
}

function handlePlaceBomb(player) {
    // Check if player can place more bombs
    const playerBombs = bombs.filter(bomb => bomb.playerId === player.id);
    if (playerBombs.length >= player.bombCount) return;

    // Check if there's already a bomb at this position
    const existingBomb = bombs.find(bomb => bomb.x === player.x && bomb.y === player.y);
    if (existingBomb || player.bombs >= player.powers.bombs) return;

    const bomb = {
        x: player.x,
        y: player.y,
        playerId: player.id,
        timestamp: Date.now(),
        flameSize: player.flameSize,
        detonator: player.powerUps.detonator
    };

    bombs.push(bomb);
    player.bombs++

    broadcast(JSON.stringify({ type: 'bombPlaced', bombs }));

    if (!bomb.detonator) {
        setTimeout(() => {
            explodeBomb(bomb, player);
    }, 2000);
    
    setTimeout(() => {
        player.bombs = 0;
    }, 3000);
    }
}

function explodeBomb(bomb, player) {
    // Remove the bomb from the array
    const bombIndex = bombs.findIndex(b => b === bomb);
    if (bombIndex === -1) return; // Bomb already exploded
    
    bombs.splice(bombIndex, 1);

    // Calculate explosion positions
    let explosions = [
        { x: bomb.x, y: bomb.y }
    ];

    // Add cross-shaped explosion with flame size
    const directions = [
        { dx: 0, dy: -player.powers.flames}, // up
        { dx: 0, dy: player.powers.flames },  // down
        { dx: -player.powers.flames, dy: 0 }, // left
        { dx: player.powers.flames, dy: 0 }   // right
    ];

    directions.forEach(dir => {
        for (let i = 1; i <= bomb.flameSize; i++) {
            const explX = bomb.x + dir.dx * i;
            const explY = bomb.y + dir.dy * i;
            
            if (explX >= 0 && explX < gridSize && explY >= 0 && explY < gridSize) {
                if (board[explY][explX] === 2) break; // Hit wall, stop explosion
                
                explosions.push({ x: explX, y: explY });
                
                // Destroy blocks and potentially create power-ups
                if (board[explY][explX] === 1) {
                    board[explY][explX] = 0;
                    
                    // 30% chance to spawn power-up
                    if (Math.random() < 0.3) {
                        spawnPowerUp(explX, explY);
                    }
                    break; // Block stops explosion
                }
            } else {
                break; // Out of bounds
            }
        }
    });

    // Check which players are hit by explosion
    players.forEach((player) => {
        if (!player.alive) return;
        
        const hit = explosions.some(expl => 
            player.x === expl.x && player.y === expl.y
        );
        
        if (hit) {
            player.lives--;
            if (player.lives <= 0) {
                player.alive = false;
                // Drop power-up on death (bonus feature)
                dropPowerUpOnDeath(player);
            } else {
                // Respawn player at starting position
                const startPos = positions[players.indexOf(player) % positions.length];
                player.x = startPos.x;
                player.y = startPos.y;
            }
        }
    });

    broadcast(JSON.stringify({
        type: 'bombExploded',
        players,
        board,
        bombs,
        powerUps,
        explosions 
    }));

    // Check for game over
    setTimeout(() => {
        checkGameOver();
    }, 1000);
}

function spawnPowerUp(x, y) {
    const powerUpTypes = ['bombs', 'flames', 'speed', 'bombPass', 'blockPass', 'detonator', 'oneUp'];
    const type = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
    
    const powerUp = {
        id: Date.now() + Math.random(),
        x: x,
        y: y,
        type: type
    };
    
    powerUps.push(powerUp);
}

function dropPowerUpOnDeath(player) {
    // Drop a random power-up at player's death location
    const powerUpTypes = ['bombs', 'flames', 'speed'];
    const type = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
    
    const powerUp = {
        id: Date.now() + Math.random(),
        x: player.x,
        y: player.y,
        type: type
    };
    
    powerUps.push(powerUp);
}

function checkGameOver() {
    const alivePlayers = players.filter(p => p.lives > 0);
    if (alivePlayers.length <= 1) {
        gameState = 'ended';
        const winner = alivePlayers.length === 1 ? alivePlayers[0] : null;
        broadcast(JSON.stringify({ 
            type: 'gameOver', 
            winner: winner 
        }));
        
        // Reset game after 10 seconds
        setTimeout(() => {
            resetGame();
        }, 10000);
    }
}

function resetGame() {
    players = [];
    bombs = [];
    powerUps = [];
    gameState = 'waiting';
    playerConnections.clear();
    clearGameTimers();
    
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
    
    broadcast(JSON.stringify({ type: 'gameReset' }));
}

// Start the server
const PORT = 8888;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
}); resetGame