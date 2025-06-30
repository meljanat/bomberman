import { CreateElement } from './src/h.js'
import { createApp } from './src/app.js'

let socket = null;

const initialState = {
    screen: 'menu', // 'menu', 'waiting', 'game', 'gameOver'
    playerName: '',
    errorMessage: '',
    statusMessage: '',
    players: [],
    bombs: [],
    board: [],
    gridSize: 11,
    gameWinner: null,
    connected: false,
    connecting: false
};

const reducers = {
    updatePlayerName: (state, name) => ({
        ...state,
        playerName: name,
        errorMessage: ''
    }),

    setError: (state, message) => ({
        ...state,
        errorMessage: message,
        connecting: false
    }),

    setStatus: (state, message) => ({
        ...state,
        statusMessage: message
    }),

    clearMessages: (state) => ({
        ...state,
        errorMessage: '',
        statusMessage: ''
    }),

    setConnecting: (state, connecting) => ({
        ...state,
        connecting: connecting
    }),

    connectToServer: (state) => {
        console.log('Attempting to connect to server...');
        
        if (socket && socket.readyState === WebSocket.OPEN) {
            console.log('Already connected');
            return { ...state, connected: true };
        }

        if (socket && socket.readyState === WebSocket.CONNECTING) {
            console.log('Already connecting');
            return { ...state, connecting: true };
        }

        try {
            // Use the correct port from server.js (8888)
            socket = new WebSocket('ws://localhost:8888');

            socket.addEventListener('open', () => {
                console.log('Connected to server');
                if (window.appEmit) {
                    window.appEmit('connectionEstablished');
                }
            });

            socket.addEventListener('message', (event) => {
                const data = JSON.parse(event.data);
                console.log('Received message:', data);
                if (window.appEmit) {
                    window.appEmit('handleServerMessage', data);
                }
            });

            socket.addEventListener('close', () => {
                console.log('Connection closed');
                if (window.appEmit) {
                    window.appEmit('connectionLost');
                }
            });

            socket.addEventListener('error', (error) => {
                console.error('WebSocket error:', error);
                if (window.appEmit) {
                    window.appEmit('setError', 'Failed to connect to server');
                }
            });

            return { ...state, connecting: true, errorMessage: '' };
        } catch (error) {
            console.error('Error creating WebSocket:', error);
            return { ...state, errorMessage: 'Failed to connect to server', connecting: false };
        }
    },

    connectionEstablished: (state) => ({
        ...state,
        connected: true,
        connecting: false,
        errorMessage: '',
        statusMessage: 'Connected to server!'
    }),

    connectionLost: (state) => ({
        ...state,
        connected: false,
        connecting: false,
        screen: 'menu',
        errorMessage: 'Connection lost. Please try again.',
        statusMessage: ''
    }),

    startGame: (state) => {
        console.log('Starting game with name:', state.playerName);
        
        if (!state.playerName.trim()) {
            return {
                ...state,
                errorMessage: 'Please enter a name'
            };
        }

        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'start', name: state.playerName.trim() }));
            return {
                ...state,
                errorMessage: '',
                statusMessage: 'Joining game...'
            };
        } else {
            console.error('Socket not ready, state:', socket ? socket.readyState : 'no socket');
            return {
                ...state,
                errorMessage: 'Not connected to server. Please wait and try again.'
            };
        }
    },

    handleServerMessage: (state, data) => {
        console.log('Handling server message:', data);
        switch (data.type) {
            case 'error':
                return {
                    ...state,
                    errorMessage: data.message,
                    statusMessage: ''
                };

            case 'waiting':
                return {
                    ...state,
                    screen: 'waiting',
                    statusMessage: data.message,
                    errorMessage: ''
                };

            case 'init':
                return {
                    ...state,
                    screen: 'game',
                    players: data.players,
                    bombs: data.bombs,
                    board: data.board,
                    statusMessage: '',
                    errorMessage: ''
                };

            case 'playerJoined':
            case 'playerLeft':
                return {
                    ...state,
                    players: data.players
                };

            case 'playerMoved':
                return {
                    ...state,
                    players: data.players
                };

            case 'bombPlaced':
                return {
                    ...state,
                    bombs: data.bombs
                };

            case 'bombExploded':
                return {
                    ...state,
                    players: data.players,
                    bombs: data.bombs,
                    board: data.board
                };

            case 'gameOver':
                return {
                    ...state,
                    screen: 'gameOver',
                    gameWinner: data.winner
                };

            default:
                return state;
        }
    },

    sendMove: (state, direction) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'move', direction }));
        }
        return state;
    },

    placeBomb: (state) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'placeBomb' }));
        }
        return state;
    },

    resetGame: (state) => ({
        ...initialState,
        connected: state.connected,
    }),
    leaveGame: (state) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'leaveGame' }));
        }
        return state
    }
};

// Keyboard handling
let keyHandler = null;

function setupKeyboardControls(emit) {
    if (keyHandler) {
        document.removeEventListener('keydown', keyHandler);
    }

    keyHandler = (event) => {
        let direction = null;

        switch (event.key) {
            case 'ArrowUp':
                direction = 'up';
                break;
            case 'ArrowDown':
                direction = 'down';
                break;
            case 'ArrowLeft':
                direction = 'left';
                break;
            case 'ArrowRight':
                direction = 'right';
                break;
            case ' ':
                event.preventDefault();
                emit('placeBomb');
                return;
        }

        if (direction) {
            event.preventDefault();
            emit('sendMove', direction);
        }
    };

    document.addEventListener('keydown', keyHandler);
}

function removeKeyboardControls() {
    if (keyHandler) {
        document.removeEventListener('keydown', keyHandler);
        keyHandler = null;
    }
}

// View functions
function renderMenu(state, emit) {
    const canJoin = state.playerName.trim() && state.connected && !state.connecting;
    const buttonText = state.connecting ? 'Connecting...' : 
                      !state.connected ? 'Connecting...' : 
                      'Join Game';

    return CreateElement('div', { class: 'menu-container' }, [
        CreateElement('div', { class: 'player-image' }, [
            CreateElement('img', {
                src: './styles/picture_enter.gif',
                alt: 'Player Avatar',
                class: 'player-avatar'
            })
        ]),

        CreateElement('div', { class: 'menu-form' }, [
            CreateElement('h1', { class: 'welcome-title' }, ['Bomberman Game']),
            CreateElement('p', { class: 'subtitle' }, ['Enter your name to join the battle!']),

            state.errorMessage ? CreateElement('div', { class: 'error-message' }, [state.errorMessage]) : null,
            state.statusMessage ? CreateElement('div', { class: 'status-message' }, [state.statusMessage]) : null,

            CreateElement('div', { class: 'input-group' }, [
                CreateElement('label', { class: 'input-label' }, ['Player Name:']),
                CreateElement('input', {
                    type: 'text',
                    class: 'name-input',
                    placeholder: 'Enter your name...',
                    value: state.playerName,
                    on: {
                        input: (e) => emit('updatePlayerName', e.target.value),
                        keydown: (e) => {
                            if (e.key === 'Enter' && canJoin) {
                                e.preventDefault();
                                emit('startGame');
                            }
                        }
                    }
                })
            ]),

            CreateElement('div', { class: 'button-group' }, [
                CreateElement('button', {
                    class: 'btn btn-primary',
                    disabled: !canJoin,
                    on: {
                        click: () => emit('startGame')
                    }
                }, [buttonText]),
                CreateElement('button', {
                    class: 'btn btn-secondary',
                    on: {
                        click: () => emit('updatePlayerName', '')
                    }
                }, ['Clear']),
                !state.connected && !state.connecting ? CreateElement('button', {
                    class: 'btn btn-secondary',
                    on: {
                        click: () => emit('connectToServer')
                    }
                }, ['Reconnect']) : null
            ])
        ])
    ]);
}

function renderWaiting(state, emit) {
    return CreateElement('div', { class: 'menu-container' }, [
        CreateElement('div', { class: 'menu-form' }, [
            CreateElement('h1', { class: 'welcome-title' }, ['Waiting for Players...']),
            CreateElement('p', { class: 'subtitle' }, [state.statusMessage]),
            CreateElement('div', { class: 'loading-indicator' }, [
                CreateElement('div', { class: 'spinner' })
            ]),
            CreateElement('div', { class: 'button-group' }, [
                CreateElement('button', {
                    class: 'btn btn-secondary',
                    on: {
                        click: () => emit('resetGame')
                    }
                }, ['Back to Menu'])
            ])
        ])
    ]);
}

function renderGameTile(state, i, j) {
    const index = i * state.gridSize + j;
    const cellValue = state.board[i] ? state.board[i][j] : 0;

    let tileClass = 'tile';
    if (cellValue === 2) tileClass += ' wall';
    else if (cellValue === 1) tileClass += ' block';
    else if (cellValue === 3) tileClass += ' explosion';

    const children = [];

    state.players.forEach(player => {
        if (player.lives > 0 && player.x === j && player.y === i) {
            children.push(CreateElement('div', {
                class: `player p${player.id}`
            }));
        }
    });

    state.bombs.forEach(bomb => {
        if (bomb.x === j && bomb.y === i) {
            children.push(CreateElement('div', {
                class: 'bomb'
            }));
        }
    });

    return CreateElement('div', { class: tileClass }, children);
}

function renderGame(state, emit) {
    setupKeyboardControls(emit);

    const gridChildren = [];
    for (let i = 0; i < state.gridSize; i++) {
        for (let j = 0; j < state.gridSize; j++) {
            gridChildren.push(renderGameTile(state, i, j));
        }
    }

    return CreateElement('div', { class: 'game-container' }, [
        CreateElement('div', { class: 'game-info' }, [
            CreateElement('h2', {}, ['Bomberman Game']),
            CreateElement('p', {}, [`Players: ${state.players.filter(p => p.lives > 0).length}`])
        ]),

        CreateElement('div', { class: 'game-grid' }, gridChildren),

        CreateElement('div', { class: 'controls' }, [
            CreateElement('p', {}, ['Use arrow keys to move']),
            CreateElement('p', {}, ['Press SPACE to place a bomb']),
            CreateElement('button', {
                class: 'btn btn-secondary',
                style: { marginTop: '10px' },
                on: {
                    click: () => {
                        removeKeyboardControls();
                        emit('resetGame');
                        emit('leaveGame');
                    }
                }
            }, ['Leave Game'])
        ])
    ]);
}

function renderGameOver(state, emit) {
    removeKeyboardControls();

    return CreateElement('div', { class: 'menu-container' }, [
        CreateElement('div', { class: 'menu-form' }, [
            CreateElement('h1', { class: 'welcome-title' }, ['Game Over!']),
            CreateElement('p', { class: 'subtitle' }, [`Winner: Player ${state.gameWinner}`]),
            CreateElement('div', { class: 'button-group' }, [
                CreateElement('button', {
                    class: 'btn btn-primary',
                    on: {
                        click: () => emit('resetGame')
                    }
                }, ['Play Again'])
            ])
        ])
    ]);
}

function view(state, emit) {
    switch (state.screen) {
        case 'waiting':
            return renderWaiting(state, emit);
        case 'game':
            return renderGame(state, emit);
        case 'gameOver':
            return renderGameOver(state, emit);
        default:
            return renderMenu(state, emit);
    }
}

const app = createApp({
    state: initialState,
    view,
    reducers
});

app.mount(document.getElementById('game-container'));

window.appEmit = app.emit;

setTimeout(() => {
    console.log('Attempting initial connection to server...');
    window.appEmit('connectToServer');
}, 1000);