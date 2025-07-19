const http = require('http');
const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');
const { clearInterval } = require('timers');

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

let players = [];
let bombs = [];
let powerUps = [];
let gridSize = 11;
let gameState = 'waiting';
let gameStartTimer = null;
let countdownTimer = null;
let countdownTimerroom = null;
let ten_sec = 5;
let twenty_sec = 5;
// const el = document.querySelector('#');
// const rect = el.getBoundingClientRect();
let TILE_SIZE = 60;
let MOVE_SPEED = 5;
let messages = [];
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

let positions = [
    { x: 1, y: 1 },
    { x: 9, y: 9 },
    { x: 1, y: 9 },
    { x: 9, y: 1 },
];

let gameStarted = false;

let playerConnections = new Map();

wss.on('connection', (ws) => {
    // console.log('A new player connected.');

    ws.send(JSON.stringify({
        type: 'chatHistory',
        messages: messages
    }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
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
            } else if (data.type === 'leaveGame') {
                const player = getPlayerByWebSocket(ws);
                let pl_pos = player.position
                if (player && gameState === 'playing') {
                    broadcast(JSON.stringify({ type: 'gameReset' }), player.id);
                    playerConnections.delete(player.id);
                    players = players.filter(a => a.id != player.id);
                }
                for (play of players) {
                    if (play.position > pl_pos && gameState != 'playing') {
                        const playerPosition = positions[play.position];
                        play.position -= 1

                        play.x = playerPosition.x

                        play.y = playerPosition.y
                    }
                }
                if (players.length < 2) {
                    checkGameOver();
                }
                players.map((p) => {
                    broadcast(JSON.stringify({ type: 'playerLeft', players }), p.id);
                })
            } else if (data.type === 'message') {
                const player = getPlayerByWebSocket(ws);
                if (player) {
                    handleChatMessage(player, data.message, ws);
                }
            } else if (data.type === 'leaveRoom') {
                const player = getPlayerByWebSocket(ws);
                let pl_pos = player.position
                playerConnections.delete(player.id);
                players = players.filter(a => a.id != player.id);
                if (players.length < 2) {
                    if (countdownTimerroom) {
                        clearInterval(countdownTimerroom);
                        countdownTimerroom = null;
                    }
                    if (countdownTimer) {
                        clearInterval(countdownTimer);
                        countdownTimer = null;
                    } players.map((p) => {
                        broadcast(JSON.stringify({ type: 'playerLeft', players }), p.id);
                    })
                } else {
                    players.map((p) => {
                        broadcast(JSON.stringify({ type: 'playerLeft', players }), p.id);
                    });
                }

                for (play of players) {
                    if (play.position > pl_pos && gameState != 'playing') {
                        play.position -= 1
                        const playerPosition = positions[play.position];

                        play.x = playerPosition.x

                        play.y = playerPosition.y
                    }
                }

            } else if (data.type === 'resize') {
                TILE_SIZE = data.width
                console.log(TILE_SIZE);
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });

    ws.on('close', () => {
        let player = getPlayerByWebSocket(ws);
        if (player) {
            players = players.filter((p) => p.id !== player.id);
            playerConnections.delete(player.id);
            players.map((p) => {
                broadcast(JSON.stringify({ type: 'playerLeft', players }), p.id);
            })

            if (players.length < 2) {
                if (twenty_sec <= 0) {
                    return checkGameOver()
                }
                clearGameTimers();
                gameState = 'waiting';
                players.map((p) => {
                    broadcast(JSON.stringify({ type: 'gameState', state: gameState }), p.id);
                })
            }

            if (gameState !== 'playing') {
                checkGameOver();
            }
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

function handleChatMessage(player, messageText, ws) {
    if (!messageText || typeof messageText !== 'string') {
        return;
    }

    messageText = messageText.trim();
    if (messageText.length === 0 || messageText.length > 20) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message lenght...' }));
        return;
    }

    const message = {
        sender: player.name,
        text: messageText,
    };

    messages.push(message);

    broadcast(JSON.stringify({
        type: 'newMessage',
        message: message,
        messages: messages,
        sender: player.name
    }));
}

function handlePlayerJoin(ws, name) {
    if (players.length >= 4) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room is already full.' }));
        return;
    }

    if (gameStarted) {
        ws.send(JSON.stringify({ type: 'error', message: 'Game has already started.' }));
        return;
    }
    const nameValidation = checkName(name);

    if (!nameValidation[0]) {
        ws.send(JSON.stringify({ type: 'error', message: nameValidation[1] }));
        return;
    }

    const playerId = Date.now();
    const playerPosition = positions[players.length];

    const player = {
        id: playerId,
        x: playerPosition.x,
        y: playerPosition.y,
        pixelX: playerPosition.x * TILE_SIZE,
        pixelY: playerPosition.y * TILE_SIZE,
        lives: 3,
        name: name,
        alive: true,
        bombCount: 1,
        bombs: 0,
        flameSize: 1,
        speed: 1,
        position: players.length
    };
    players.push(player);
    playerConnections.set(playerId, ws);
    if (players.length === 1) {
        addBlocks();
    }
    players.map(a => {
        broadcast(JSON.stringify({ type: 'playerJoined', players }), a.id);
    })


    if (players.length >= 2) {
        if (players.length === 4) {
            startCountdown();
        } else if (!gameStartTimer) {
            if (players.length >= 2) {
                startCountdownRoom();
            }
        }
    }

    ws.send(JSON.stringify({
        type: 'gameState',
        state: gameState,
        players,
        board,
        bombs,
        powerUps,
        countdown: ten_sec
    }));
}

function startCountdownRoom() {
    clearGameTimers();
    gameState = 'waiting';
    twenty_sec = 5;
    players.map(a => {
        broadcast(JSON.stringify({ type: 'waiting', secondsroom: twenty_sec, countdownroom: twenty_sec, players }), a.id);
    });

    countdownTimerroom = setInterval(() => {
        twenty_sec--;
        players.map(a => {
            broadcast(JSON.stringify({ type: 'waiting', secondsroom: twenty_sec, countdownroom: twenty_sec, players }), a.id);
        });

        if (twenty_sec <= 0) {
            clearInterval(countdownTimerroom);
            gameStarted = true;
            startCountdown();
        }
    }, 1000);
}

function startCountdown() {
    gameState = 'countdown';
    ten_sec = 2;
    clearGameTimers();

    players.map(a => {
        broadcast(JSON.stringify({ type: 'countdown', seconds: ten_sec }), a.id);
    });

    countdownTimer = setInterval(() => {
        ten_sec--;
        players.map(a => {
            broadcast(JSON.stringify({ type: 'countdown', seconds: ten_sec }), a.id);
        });
        if (players.length < 2) {
            checkGameOver()
            return
        }
        if (ten_sec <= 0) {
            clearInterval(countdownTimer);
            startGame();
        }
    }, 1000);
}

function startGame() {
    gameState = 'playing';
    gameStarted = true;
    players.map(a => {
        broadcast(JSON.stringify({ type: 'gameStart', board, players, bombs, powerUps }), a.id);
    });
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
    if (countdownTimerroom) {
        clearInterval(countdownTimerroom)
        countdownTimerroom = null;
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
    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            if (board[i][j] === 1) {
                board[i][j] = 0;
            }
        }
    }

    for (let i = 1; i < gridSize - 1; i++) {
        for (let j = 1; j < gridSize - 1; j++) {
            if (board[i][j] === 0) {
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
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && (!id || playerConnections.get(id) == client)) {
            client.send(message);
        }
    });
}

function handlePlayerMove(player, direction) {
    let newX = player.pixelX !== undefined ? player.pixelX : (player.x * TILE_SIZE);
    let newY = player.pixelY !== undefined ? player.pixelY : (player.y * TILE_SIZE);
    console.log(`Player ${player.name} is moving ${direction} from (${newX}, ${newY})`);
    
    const moveDistance = MOVE_SPEED * player.speed;

    if (direction === 'up') newY -= moveDistance;
    else if (direction === 'down') newY += moveDistance;
    else if (direction === 'left') newX -= moveDistance;
    else if (direction === 'right') newX += moveDistance;

    const playerSize = TILE_SIZE * 0.8;
    newX = Math.max(0, Math.min(newX, (gridSize * TILE_SIZE) - playerSize));
    newY = Math.max(0, Math.min(newY, (gridSize * TILE_SIZE) - playerSize));

    if (checkTileAdvanced(player, newX, newY)) {
        player.pixelX = newX;
        player.pixelY = newY;
        
        const centerX = newX + (playerSize / 2);
        const centerY = newY + (playerSize / 2);
        player.x = Math.floor(centerX / TILE_SIZE);
        player.y = Math.floor(centerY / TILE_SIZE);

        checkPowerUpCollection(player);
        broadcast(JSON.stringify({ type: 'playerMoved', players }));
    }
}

function checkTileAdvanced(player, newPixelX, newPixelY) {
    const playerSize = TILE_SIZE * 0.8;
    const playerLeft = newPixelX;
    const playerRight = newPixelX + playerSize;
    const playerTop = newPixelY;
    const playerBottom = newPixelY + playerSize;
    
    const leftTile = Math.floor(playerLeft / TILE_SIZE);
    const rightTile = Math.floor((playerRight - 1) / TILE_SIZE);
    const topTile = Math.floor(playerTop / TILE_SIZE);
    const bottomTile = Math.floor((playerBottom - 1) / TILE_SIZE);
    
    console.log(`Player bounds: (${playerLeft}, ${playerTop}) to (${playerRight}, ${playerBottom})`);
    console.log(`Checking tiles from (${leftTile}, ${topTile}) to (${rightTile}, ${bottomTile})`);
    
    for (let x = leftTile; x <= rightTile; x++) {
        for (let y = topTile; y <= bottomTile; y++) {
            if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) {
                console.log(`Tile (${x}, ${y}) is outside grid bounds`);
                return false;
            }
            
            if (board[y][x] === 1 || board[y][x] === 2) {
                console.log(`Tile (${x}, ${y}) is a wall/block (value: ${board[y][x]})`);
                return false;
            }
            
            const hasBomb = bombs.some(bomb => bomb.x === x && bomb.y === y);
            if (hasBomb) {
                console.log(`Tile (${x}, ${y}) has a bomb`);
                return true;
            }
            
            const hasOtherPlayer = players.some(p => 
                p.id !== player.id && p.x === x && p.y === y
            );
            if (hasOtherPlayer) {
                console.log(`Tile (${x}, ${y}) has another player`);
                return false;
            }
        }
    }
    
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
            player.speed = Math.min(player.speed + 0.5, 2);
            break;
    }
}

function handlePlaceBomb(player) {
    const playerBombs = bombs.filter(bomb => bomb.playerId === player.id);
    if (playerBombs.length >= player.bombCount) return;

    const existingBomb = bombs.find(bomb => bomb.x === player.x && bomb.y === player.y);
    if (existingBomb) return;

    const bomb = {
        x: player.x,
        y: player.y,
        playerId: player.id,
        flameSize: player.flameSize,
    };

    bombs.push(bomb);

    broadcast(JSON.stringify({ type: 'bombPlaced', bombs }));

    setTimeout(() => {
        explodeBomb(bomb);
    }, 1000);
}

function explodeBomb(bomb) {
    const bombIndex = bombs.findIndex(b => b === bomb);
    if (bombIndex === -1) return;

    bombs.splice(bombIndex, 1);

    let explosions = [
        { x: bomb.x, y: bomb.y }
    ];

    const directions = [
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 }
    ];

    directions.forEach(dir => {
        for (let i = 1; i <= bomb.flameSize; i++) {
            const explX = bomb.x + dir.dx * i;
            const explY = bomb.y + dir.dy * i;

            if (explX >= 0 && explX < gridSize && explY >= 0 && explY < gridSize) {
                if (board[explY][explX] === 2) break;

                explosions.push({ x: explX, y: explY });

                if (board[explY][explX] === 1) {
                    board[explY][explX] = 0;

                    if (Math.random() < 0.3) {
                        spawnPowerUp(explX, explY);
                    }
                    break;
                }
            } else {
                break;
            }
        }
    });

    players.forEach((hitPlayer) => {
        if (!hitPlayer.alive) return;

        const hit = explosions.some(expl =>
            hitPlayer.x === expl.x && hitPlayer.y === expl.y
        );

        if (hit) {
            hitPlayer.lives--;
            if (hitPlayer.lives <= 0) {
                hitPlayer.alive = false;
                dropPowerUpOnDeath(hitPlayer);
            } else {
                const startPos = positions[hitPlayer.position % positions.length];
                hitPlayer.x = startPos.x;
                hitPlayer.y = startPos.y;
                hitPlayer.pixelX = startPos.x * TILE_SIZE;
                hitPlayer.pixelY = startPos.y * TILE_SIZE;
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

    setTimeout(() => {
        checkGameOver();
    }, 1000);
}

function spawnPowerUp(x, y) {
    const powerUpTypes = ['bombs', 'flames', 'speed'];
    const type = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
    const powerUp = {
        x: x,
        y: y,
        type: type
    };
    powerUps.push(powerUp);
}

function dropPowerUpOnDeath(player) {
    const powerUpTypes = ['bombs', 'flames', 'speed'];
    const type = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
    const powerUp = {
        x: player.x,
        y: player.y,
        type: type
    };
    powerUps.push(powerUp);
}

function checkGameOver() {
    const alivePlayers = players.filter(p => p.alive);
    if (alivePlayers.length <= 1) {
        gameState = 'ended';
        const winner = alivePlayers.length === 1 ? alivePlayers[0] : null;
        gameStarted = false
        players.map(a => {
            broadcast(JSON.stringify({
                type: 'gameOver',
                winner: winner
            }), a.id);
        });
        setTimeout(() => {
            resetGame();
        }, 5000);
    }
}

function resetGame() {
    players = [];
    bombs = [];
    powerUps = [];
    gridSize = 11;
    gameState = 'waiting';
    gameStartTimer = null;
    countdownTimer = null;
    countdownTimerroom = null;
    ten_sec = 10;
    twenty_sec = 20;
    messages = [];
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
    positions = [
        { x: 1, y: 1 },
        { x: 9, y: 9 },
        { x: 1, y: 9 },
        { x: 9, y: 1 },
    ];
    gameStarted = false;
}
const PORT = 8888;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});