const http = require('http');
const WebSocket = require('ws');
const fs = require('fs').promises; // Use promises for async file operations
const path = require('path');

const staticFiles = path.join(__dirname, 'public'); // Directory containing static files

const server = http.createServer(async (req, res) => {
    try {
        let filePath = req.url;

        // Construct the full file path
        filePath = path.join(staticFiles, filePath === '/' ? '/index.html' : filePath);

        // Prevent directory traversal attacks
        if (!filePath.startsWith(staticFiles)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            return res.end('Forbidden');
        }

        // Check if the file exists
        try {
            await fs.access(filePath);
        } catch {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('404 Not Found');
        }

        // Determine the content type
        const contentType = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'text/javascript',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif'
        }[path.extname(filePath)] || 'text/plain';

        // Read and serve the file
        const data = await fs.readFile(filePath);
        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
        });
        res.end(data);
    } catch (err) {
        console.error('Error handling request:', err);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
    }
});

// Attach a WebSocket server to the HTTP server
const wss = new WebSocket.Server({ server });

// Game state
let players = [];
let bombs = [];
let gridSize = 11; // 11x11 grid
let board = [
    [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    [2, 9, 9, 0, 0, 0, 0, 0, 9, 9, 2],
    [2, 9, 2, 0, 2, 0, 2, 0, 2, 9, 2],
    [2, 9, 0, 0, 0, 0, 0, 0, 0, 9, 2],
    [2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2],
    [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
    [2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2],
    [2, 9, 0, 0, 0, 0, 0, 0, 0, 9, 2],
    [2, 9, 2, 0, 2, 0, 2, 0, 2, 9, 2],
    [2, 9, 9, 0, 0, 0, 0, 0, 9, 9, 2],
    [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
];
const positions = [
    { x: 1, y: 1 },
    { x: 9, y: 9 },
    { x: 1, y: 9 },
    { x: 9, y: 1 },
];

wss.on('connection', (ws) => {
    console.log('A new player connected.');

    const playerId = players.length + 1;
    const player = {
        id: playerId,
        x: positions[playerId - 1].x,
        y: positions[playerId - 1].y,
        alive: true,
        name: '',
    };
    players.push(player);


    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'start') {
            if (players.length === 1) {
                addBlocks();
            }
            if (players.length > 4) {
                ws.send(JSON.stringify({ type: 'error', message: 'Room is already full.' }));
                players.filter((p) => p.id !== player.id);
            } else if (!checkName(data.name)[0]) {
                ws.send(JSON.stringify({ type: 'error', message: checkName(data.name)[1] }));
                players.filter((p) => p.id !== player.id);
            } else {
                if (players.length > 1) {
                    // broadcast(JSON.stringify({ type: 'waiting', message: 'Starting in 20 seconds if no more players join.' }));
                    // setTimeout(() => {
                    // }, 20000);
                    broadcast(JSON.stringify({ type: 'init', board, players, bombs }));
                } else {
                    broadcast(JSON.stringify({ type: 'waiting', message: 'Currently in room: ' + players.length + '/4 please wait for more players to join.' }));
                }
                player.name = data.name;
            }
        }

        if (data.type === 'move') {
            handlePlayerMove(player, data.direction);
        } else if (data.type === 'placeBomb') {
            handlePlaceBomb(player);
        }
    });

    // Handle disconnections
    ws.on('close', () => {
        console.log('A player disconnected.');
        players = players.filter((p) => p.id !== player.id);
        broadcast(JSON.stringify({ type: 'playerLeft', players }));
    });
});

// Check for game over
if (players.length <= 1) {
    broadcast(JSON.stringify({ type: 'gameOver', winner: players[0]?.id }));
}

function addBlocks() {
    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            if (board[i][j] === 0 && Math.random() < 0.9) {
                board[i][j] = 1;
            }
        }
    }
}

function checkName(name) {
    name = name.trim();
    if (name.length === 0) {
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

// Broadcast a message to all connected players
function broadcast(message) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Handle player movement
function handlePlayerMove(player, direction) {
    let newX = player.x;
    let newY = player.y;

    if (direction === 'up' && checkTile(newX, newY - 1)) newY -= 1;
    else if (direction === 'down' && checkTile(newX, newY + 1)) newY += 1;
    else if (direction === 'left' && checkTile(newX - 1, newY)) newX -= 1;
    else if (direction === 'right' && checkTile(newX + 1, newY)) newX += 1;

    player.x = newX;
    player.y = newY;
    broadcast(JSON.stringify({ type: 'playerMoved', players }));
}

function checkTile(x, y) {
    if (board[y][x] === 2 || board[y][x] === 1 || board[y][x] === 3) return false;
    return true;
}

function handlePlaceBomb(player) {
    const bomb = { x: player.x, y: player.y };
    board[player.y][player.x] = 3;
    bombs.push(bomb);
    broadcast(JSON.stringify({ type: 'bombPlaced', bombs }));

    setTimeout(() => {
        explodeBomb(bomb);
    }, 3000);
}

// Handle bomb explosion
function explodeBomb(explosion) {
    bombs = bombs.filter((b) => b !== explosion);
    board[explosion.y][explosion.x] = 0;
    let explosions = [
        { x: explosion.x, y: explosion.y },
        { x: explosion.x - 1, y: explosion.y },
        { x: explosion.x + 1, y: explosion.y },
        { x: explosion.x, y: explosion.y - 1 },
        { x: explosion.x, y: explosion.y + 1 }
    ];

    players.forEach((player) => {
        if (
            (player.x === explosion.x && player.y === explosion.y) ||
            (player.x === explosion.x - 1 && player.y === explosion.y) ||
            (player.x === explosion.x + 1 && player.y === explosion.y) ||
            (player.x === explosion.x && player.y === explosion.y - 1) ||
            (player.x === explosion.x && player.y === explosion.y + 1)
        ) {
            player.alive = false;
        }
    });
    
    explosions.forEach((explosion) => {
        if (board[explosion.x][explosion.y] !== 2) {
            board[explosion.x][explosion.y] = 4;
        }
    });
    setTimeout(() => {
        explosions.forEach((explosion) => {
            board[explosion.x][explosion.y] = 0;
        });
    }, 1000);

    players = players.filter((player) => player.alive);

    broadcast(JSON.stringify({ type: 'bombExploded', players, board, bombs }));
}

// Start the server
const PORT = 8088;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});



// const http = require('http');
// const WebSocket = require('ws');
// const fs = require('fs');
// const path = require('path');

// // Game data
// const players = [
//     // {
//     //     id: 1,
//     //     name: 'Player 1',
//     //     position: { x: 1, y: 2 },
//     //     bombsLeft: 1,
//     //     lives: 3,
//     // }
// ];

// const gameData = {
//     currentPlayer: 0,
//     players: players,
//     board: board,
//     gameStarted: false,
//     gameStartedTime: null,
//     gameDuration: 0,
// }

// const staticFiles = path.join(__dirname, 'public');

// // Create an HTTP server
// const server = http.createServer((req, res) => {
//     console.log(`${req.method} ${req.url}`);

//     const filePath = path.join(staticFiles, req.url === '/' ? '/index.html' : req.url);
//     if (req.url == '/checkName') {
//         const name = req.body
//         console.log(name);
//         res.writeHead(500, { 'Content-Type': 'text/plain' });
//         res.end('Invalid name');
//     } else if (fs.existsSync(filePath)) {
//         const ext = path.extname(filePath);
//         const contentType = getContentType(ext);
//         fs.readFile(filePath, (err, content) => {
//             if (err) {
//                 res.writeHead(500, { 'Content-Type': 'text/plain' });
//                 res.end('Error loading file');
//             } else {
//                 res.writeHead(200, { 'Content-Type': contentType });
//                 res.end(content);
//             }
//         });
//     } else {
//         res.writeHead(404, { 'Content-Type': 'text/plain' });
//         res.end('Page not found');
//     }
// });

// // Attach a WebSocket server to the HTTP server
// const wss = new WebSocket.Server({ server });

// // Handle WebSocket connections
// wss.on('connection', (ws) => {
//     console.log('A new client connected.');

//     // Send a welcome message to the client
//     ws.send('Welcome to the WebSocket server!');

//     // Listen for messages from the client
//     ws.on('message', (message) => {
//         console.log(`Received message: ${message}`);

//         // Broadcast the message to all connected clients
//         wss.clients.forEach((client) => {
//             if (client.readyState === WebSocket.OPEN) {
//                 client.send(`Broadcast: ${message}`);
//             }
//         });
//     });

//     // Handle client disconnection
//     ws.on('close', () => {
//         console.log('A client disconnected.');
//     });
// });

// // Start the server
// const PORT = 8080;
// server.listen(PORT, () => {
//     console.log(`Server is running on http://localhost:${PORT}`);
// });

// function getContentType(ext) {
//     switch (ext) {
//         case '.html':
//             return 'text/html';
//         case '.css':
//             return 'text/css';
//         case '.js':
//             return 'text/javascript';
//         default:
//             return 'text/plain';
//     }
// }

// function checkName(name) {
//     return true;
// }
