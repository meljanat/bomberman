const socket = new WebSocket('ws://localhost:8088');
let gameGrid;
let tiles = [];
let players = [];
let gridSize = 11;
let board = [];

function createGameGrid() {
    for (let i = 0; i < gridSize * gridSize; i++) {
        const tile = document.createElement('div');
        tile.classList.add('tile');
        gameGrid.appendChild(tile);
    }
    tiles = Array.from(document.querySelectorAll('#game-grid .tile'))
}

function updateBoard() {
    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            const index = i * gridSize + j;
            if (board[i][j] === 2) {
                tiles[index].classList.add('wall');
            } else if (board[i][j] === 1) {
                tiles[index].classList.add('block');
            } else if (board[i][j] === 3) {
                tiles[index].classList.add('explosion');
            } else {
                tiles[index].classList.remove('wall', 'block', 'explosion');
            }
        }
    }
}

// Render the game
function renderGame() {
    tiles.forEach(tile => {
        while (tile.firstChild) {
            tile.removeChild(tile.firstChild);
        }
    });

    players.forEach((player) => {
        if (player.alive) {
            const playerDiv = document.createElement('div');
            playerDiv.classList.add('player', `p${player.id}`);
            const cellIndex = player.y * gridSize + player.x;
            tiles[cellIndex].appendChild(playerDiv);
        }
    });

    bombs.forEach((bomb) => {
        const bombDiv = document.createElement('div');
        bombDiv.classList.add('bomb');
        const cellIndex = bomb.y * gridSize + bomb.x;
        tiles[cellIndex].appendChild(bombDiv);
    });
}

function explodeBomb(bomb) {
    const bombDiv = document.createElement('div');
    bombDiv.classList.add('bomb');
    const cellIndex = bomb.y * gridSize + bomb.x;
    tiles[cellIndex].appendChild(bombDiv);
}

function waitingHandler(message) {
    startDiv.textContent = message;
}

// Handle incoming messages
socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'error') {
        nameError.textContent = data.message;
        nameError.style.display = 'block';
        setTimeout(() => {
            nameError.textContent = '';
            nameError.style.display = 'none';
        }, 3000);
    } else if (data.type === 'init') {
        startDiv.remove();
        players = data.players;
        bombs = data.bombs;
        board = data.board;
        startGame();
    } else if (data.type === 'waiting') {
        waitingHandler(data.message);
    } else if (data.type === 'playerJoined' || data.type === 'playerLeft') {
        players = data.players;
    } else if (data.type === 'playerMoved') {
        players = data.players;
    } else if (data.type === 'bombPlaced') {
        bombs = data.bombs;
    } else if (data.type === 'bombExploded') {
        players = data.players;
        bombs = data.bombs;
        board = data.board;
        explodeBomb(data.bomb);
    } else if (data.type === 'gameOver') {
        alert(`Game Over! Winner: Player ${data.winner}`);
    }
});

// Handle user input
document.addEventListener('keydown', (event) => {
    let direction = null;

    if (event.key === 'ArrowUp') direction = 'up';
    else if (event.key === 'ArrowDown') direction = 'down';
    else if (event.key === 'ArrowLeft') direction = 'left';
    else if (event.key === 'ArrowRight') direction = 'right';

    if (direction) {
        socket.send(JSON.stringify({ type: 'move', direction }));
    }

    if (event.key === ' ') {
        socket.send(JSON.stringify({ type: 'placeBomb' }));
    }
});

function startGame() {
    gameGrid = document.createElement('div');
    gameGrid.id = 'game-grid';
    document.body.prepend(gameGrid);
    createGameGrid();
    updateGame();
}

function updateGame() {
    renderGame();
    updateBoard();
    requestAnimationFrame(updateGame);
}


const startDiv = document.getElementById('start-div');
const startButton = document.getElementById('start-button');
const nameError = document.getElementById('name-error');

const usrName = document.getElementById('name-input');

startButton.addEventListener('click', () => {
    console.log(usrName.value);
    socket.send(JSON.stringify({ type: 'start', name: usrName.value }));
});
