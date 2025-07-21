import { createElement, render, createStateManager } from './src/framework.js';

let socket = null;
let animationId = null;
let lastFrameTime = 0;
let frameCount = 0;
let fpsDisplay = 0;

const initialState = {
    screen: 'menu',
    playerName: '',
    errorMessage: '',
    statusMessage: '',
    players: [],
    bombs: [],
    powerUps: [],
    board: [],
    gridSize: 11,
    gameWinner: null,
    connected: false,
    connecting: false,
    messages: [],
    showChat: false,
    countdown: 0,
    countdownroom: 0,
    isCountingDown: false,
    isCountingDownRoom: false,
    explosions: [],
    chatInput: '',
    currentPlayer: null,
    fps: 0
};

const appStateManager = createStateManager(initialState);
let currentVNode = null;
const appContainer = document.getElementById('game-container');

const appEmit = (actionType, payload) => {
    const currentState = appStateManager.getState();
    let newState = { ...currentState };

    switch (actionType) {
        case 'updatePlayerName':
            newState = { ...currentState, playerName: payload, errorMessage: '' };
            break;
        case 'updateChatInput':
            newState = { ...currentState, chatInput: payload };
            break;
        case 'toggleChat':
            newState = { ...currentState, showChat: !currentState.showChat };
            break;
        case 'sendChatMessage':
            const messageToSend = payload || currentState.chatInput;
            if (socket && socket.readyState === WebSocket.OPEN && messageToSend.trim()) {
                socket.send(JSON.stringify({
                    type: 'message',
                    message: messageToSend.trim()
                }));
                newState = { ...currentState, chatInput: '' };
            }
            break;
        case 'setError':
            newState = { ...currentState, errorMessage: payload, connecting: false };
            break;
        case 'setStatus':
            newState = { ...currentState, statusMessage: payload };
            break;
        case 'clearMessages':
            newState = { ...currentState, errorMessage: '', statusMessage: '' };
            break;
        case 'setConnecting':
            newState = { ...currentState, connecting: payload };
            break;
        case 'updateFPS':
            newState = { ...currentState, fps: payload };
            break;
        case 'connectToServer':
            console.log('Attempting to connect to server...');
            if (socket && socket.readyState === WebSocket.OPEN) {
                console.log('Already connected');
                newState = { ...currentState, connected: true };
                break;
            }
            if (socket && socket.readyState === WebSocket.CONNECTING) {
                console.log('Already connecting');
                newState = { ...currentState, connecting: true };
                break;
            }
            try {
                socket = new WebSocket('ws://localhost:8888');
                socket.addEventListener('open', () => {
                    console.log('Connected to server');
                    appEmit('connectionEstablished');
                });
                socket.addEventListener('message', (event) => {
                    const data = JSON.parse(event.data);
                    appEmit('handleServerMessage', data);
                });
                socket.addEventListener('close', () => {
                    console.log('Connection closed');
                    appEmit('connectionLost');
                });
                socket.addEventListener('error', (error) => {
                    console.error('WebSocket error:', error);
                    appEmit('setError', 'Failed to connect to server');
                });
                newState = { ...currentState, connecting: true, errorMessage: '' };
            } catch (error) {
                console.error('Error creating WebSocket:', error);
                newState = { ...currentState, errorMessage: 'Failed to connect to server', connecting: false };
            }
            break;
        case 'connectionEstablished':
            newState = { ...currentState, connected: true, connecting: false, errorMessage: '', statusMessage: 'Connected to server!' };
            break;
        case 'connectionLost':
            newState = { ...currentState, connected: false, connecting: false, screen: 'menu', errorMessage: 'Connection lost. Please try again.', statusMessage: '', currentPlayer: null, messages: [] };
            break;
        case 'startGame':
            console.log('Starting game with name:', currentState.playerName);
            if (!currentState.playerName.trim()) {
                newState = { ...currentState, errorMessage: 'Please enter a name' };
                break;
            }
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'start', name: currentState.playerName.trim() }));
                newState = { ...currentState, errorMessage: '', statusMessage: 'Joining game...' };
            } else {
                console.error('Socket not ready, state:', socket ? socket.readyState : 'no socket');
                newState = { ...currentState, errorMessage: 'Not connected to server. Please wait and try again.' };
            }
            break;
        case 'handleServerMessage':
            const data = payload;
            switch (data.type) {
                case 'error':
                    newState = { ...currentState, errorMessage: data.message, statusMessage: '' };
                    break;
                case 'gameState':
                    const updatedGameState = {
                        ...currentState,
                        players: data.players || currentState.players,
                        bombs: data.bombs || currentState.bombs,
                        powerUps: data.powerUps || currentState.powerUps,
                        board: data.board || currentState.board,
                        statusMessage: '',
                        errorMessage: ''
                    };
                    if (data.players) {
                        const currentPlayer = data.players.find(p => p.name === currentState.playerName);
                        updatedGameState.currentPlayer = currentPlayer;
                    }
                    if (data.state === 'waiting') {
                        updatedGameState.screen = 'waiting';
                        updatedGameState.isCountingDownRoom = true;
                        updatedGameState.countdownroom = data.secondsroom || 20;
                        updatedGameState.statusMessage = `Waiting for players... (${data.players.length}/4)`;
                    } else if (data.state === 'countdown') {
                        updatedGameState.screen = 'countdown';
                        updatedGameState.isCountingDownRoom = false;
                        updatedGameState.isCountingDown = true;
                        updatedGameState.countdown = data.countdown || 10;
                    } else if (data.state === 'playing') {
                        updatedGameState.screen = 'game';
                        updatedGameState.isCountingDown = false;
                    }
                    newState = updatedGameState;
                    break;
                case 'playerJoined':
                    newState = {
                        ...currentState,
                        players: data.players,
                        screen: 'waiting',
                        isCountingDownRoom: true,
                        countdownroom: data.secondsroom,
                        statusMessage: `Waiting for players... (${data.players.length}/4)`,
                        currentPlayer: data.players.find(p => p.name === currentState.playerName)
                    };
                    break;
                case 'playerLeft':
                    newState = {
                        ...currentState,
                        players: data.players,
                        statusMessage: `Waiting for players... (${data.players.length}/4)`,
                    };
                    break;
                case 'countdown':
                    newState = {
                        ...currentState,
                        screen: 'countdown',
                        isCountingDown: true,
                        countdown: data.seconds
                    };
                    break;
                case 'waiting':
                    newState = {
                        ...currentState,
                        screen: 'waiting',
                        isCountingDownRoom: true,
                        countdownroom: data.secondsroom || data.countdownroom || 20,
                        statusMessage: `Waiting for players... (${currentState.players.length}/4)`
                    };
                    break;
                case 'gameStart':
                    newState = {
                        ...currentState,
                        screen: 'game',
                        isCountingDown: false,
                        players: data.players,
                        bombs: data.bombs,
                        powerUps: data.powerUps,
                        board: data.board,
                        statusMessage: 'Game started!'
                    };
                    break;
                case 'playerMoved':
                    newState = {
                        ...currentState,
                        players: data.players,
                        currentPlayer: data.players.find(p => p.name === currentState.playerName)
                    };
                    break;
                case 'bombPlaced':
                    newState = { ...currentState, bombs: data.bombs };
                    break;
                case 'bombExploded':
                    newState = {
                        ...currentState,
                        players: data.players,
                        bombs: data.bombs,
                        board: data.board,
                        powerUps: data.powerUps,
                        explosions: data.explosions || [],
                        currentPlayer: data.players.find(p => p.name === currentState.playerName)
                    };
                    setTimeout(() => appEmit('clearExplosions'), 500);
                    break;
                case 'powerUpCollected':
                    newState = {
                        ...currentState,
                        players: data.players,
                        powerUps: data.powerUps,
                        currentPlayer: data.players.find(p => p.name === currentState.playerName)
                    };
                    break;
                case 'newMessage':
                    newState = {
                        ...currentState,
                        messages: [data.message, ...(currentState.messages || [])]
                    };
                    break;
                case 'messageHistory':
                    newState = { ...currentState, messages: data.messages || [] };
                    break;
                case 'gameOver':
                    newState = {
                        ...currentState,
                        screen: 'gameOver',
                        gameWinner: data.winner
                    };
                    break;
                case 'gameReset':
                    newState = {
                        ...initialState,
                        connected: currentState.connected,
                        playerName: currentState.playerName,
                        screen: 'menu',
                        statusMessage: 'Game reset ..., You can join to play again',
                    };
                    break;
                case 'playerDead':
                    newState = {
                        ...initialState,
                        connected: currentState.connected,
                        playerName: currentState.playerName,
                        screen: 'menu',
                        errorMessage: 'You lose, join to try again.',
                    }
                    break;
                case 'chatHistory':
                    newState = { ...currentState, messages: data.messages || [] };
                    break;
            }
            break;
        case 'sendMove':
            if (socket && socket.readyState === WebSocket.OPEN && currentState.screen === 'game') {
                socket.send(JSON.stringify({ type: 'move', direction: payload }));
            }
            break;
        case 'placeBomb':
            if (socket && socket.readyState === WebSocket.OPEN && currentState.screen === 'game') {
                socket.send(JSON.stringify({ type: 'placeBomb' }));
            }
            break;
        case 'clearExplosions':
            newState = { ...currentState, explosions: [] };
            break;
        case 'resetGame':
            newState = {
                ...initialState,
                connected: currentState.connected,
                messages: []
            };
            break;
        case 'leaveGame':
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'leaveGame' }));
            }
            newState = {
                ...initialState,
                connected: currentState.connected,
                playerName: currentState.playerName,
                messages: []
            };
            break;
        case 'leaveRoom':
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'leaveRoom' }));
            }
            newState = {
                ...initialState,
                connected: currentState.connected,
                playerName: currentState.playerName,
                messages: []
            };
            break;
        default:
            console.warn('Unknown action type:', actionType);
            return;
    }
    appStateManager.setState(newState);
};

let keyHandler = null;
let keysPressed = {};

const keyUpHandler = (event) => {
    keysPressed[event.key] = false;
};

function setupKeyboardControls() {
    keyHandler = (event) => {
        if (document.activeElement && document.activeElement.tagName === 'INPUT') {
            return;
        }

        if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowRight'
            || event.key === 'ArrowLeft' || event.key === ' ' || event.key === 'c' || event.key === 'C') {
            event.preventDefault();

            keysPressed[event.key] = true;
        }
    };

    window.keyUpHandler = keyUpHandler;
    document.addEventListener('keydown', keyHandler);
    document.addEventListener('keyup', keyUpHandler);
}

function removeKeyboardControls() {
    if (keyHandler) {
        document.removeEventListener('keydown', keyHandler);
        document.removeEventListener('keyup', window.keyUpHandler);
        keyHandler = null;
        keysPressed = {};
    }
}

function startGameLoop(emitFn) {
    function gameLoop(currentTime) {
        if (currentTime - lastFrameTime >= 1000) {
            fpsDisplay = frameCount;
            frameCount = 0;
            lastFrameTime = currentTime;
            emitFn('updateFPS', fpsDisplay);
        }
        frameCount++;

        updatePlayer(emitFn);

        animationId = requestAnimationFrame(gameLoop);
    }

    if (!animationId) {
        animationId = requestAnimationFrame(gameLoop);
    }
}

function stopGameLoop() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
}

function renderChatMessages(state) {
    if (!state.messages || state.messages.length === 0) {
        return createElement('div', { class: 'chat-empty' }, ['No messages yet...']);
    }
    return createElement('div', { class: 'chat-messages' },
        state.messages.map(msg =>
            createElement('div', { class: 'chat-message', key: msg.id || `${msg.sender}-${msg.timestamp}` }, [
                createElement('span', { class: 'chat-sender' }, [`${msg.sender}: `]),
                createElement('span', { class: 'chat-text' }, [msg.text])
            ])
        )
    );
}

function renderChat(state, emitFn) {
    if (!state.showChat) return null;

    return createElement('div', { class: 'chat-container' }, [
        createElement('div', { class: 'chat-header' }, [
            createElement('h3', {}, ['Chat']),
            createElement('button', {
                class: 'chat-close',
                on: { click: () => emitFn('toggleChat') }
            }, ['×'])
        ]),
        renderChatMessages(state),
        createElement('div', { class: 'chat-input-container' }, [
            createElement('input', {
                type: 'text',
                placeholder: 'Type your message...',
                maxlength: '20',
                value: state.chatInput,
                on: {
                    input: (e) => emitFn('updateChatInput', e.target.value),
                    keydown: (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            const message = e.target.value.trim();
                            if (message) {
                                emitFn('sendChatMessage', message);
                            }
                        }
                    }
                }
            }),
            createElement('button', {
                class: 'chat-send-btn',
                on: {
                    click: () => {

                        const message = state.chatInput.trim();
                        if (message) {
                            emitFn('sendChatMessage', message);
                        }
                    }
                }
            }, ['Send'])
        ]),
        createElement('div', { class: 'chat-status' }, ['Connected • Ready to chat'])
    ]);
}

function renderMenu(state, emitFn) {
    const canJoin = state.playerName.trim() && state.connected && !state.connecting;
    const buttonText = state.connecting ? 'Connecting...' :
        !state.connected ? 'Connecting...' :
            'Join Game';

    return createElement('div', { class: 'menu-container' }, [
        createElement('div', { class: 'menu-form' }, [
            createElement('h1', { class: 'welcome-title' }, ['💣 Bomberman Game 💣']),
            createElement('p', { class: 'subtitle' }, ['Enter your name to join the battle!']),

            createElement('div', { class: 'message-container' }, [
                state.errorMessage ? createElement('div', { class: 'error-message' }, [state.errorMessage]) : null,
                state.statusMessage ? createElement('div', { class: 'status-message' }, [state.statusMessage]) : null,
            ].filter(Boolean)),

            createElement('div', { class: 'input-group' }, [
                createElement('label', { class: 'input-label' }, ['Player Name:']),
                createElement('input', {
                    type: 'text',
                    class: 'name-input',
                    placeholder: 'Enter your name...',
                    value: state.playerName,
                    maxlength: '20',
                    on: {
                        input: (e) => emitFn('updatePlayerName', e.target.value),
                        keydown: (e) => {
                            if (e.key === 'Enter' && canJoin) {
                                e.preventDefault();
                                emitFn('startGame');
                            }
                        }
                    }
                })
            ]),

            createElement('div', { class: 'button-group' }, [
                createElement('button', {
                    class: 'btn btn-primary',
                    disabled: !canJoin,
                    on: {
                        click: () => emitFn('startGame')
                    }
                }, [buttonText]),
                createElement('button', {
                    class: 'btn btn-secondary',
                    on: {
                        click: () => {
                            emitFn('updatePlayerName', '')
                        }
                    }
                }, ['Clear']),
                !state.connected && !state.connecting ? createElement('button', {
                    class: 'btn btn-secondary',
                    on: {
                        click: () => emitFn('connectToServer')
                    }
                }, ['Reconnect']) : null
            ].filter(Boolean))
        ])
    ]);
}

function renderWaiting(state, emitFn) {
    return createElement('div', { class: 'menu-container' }, [
        createElement('div', { class: 'menu-form waiting-form' }, [
            createElement('h1', { class: 'welcome-title' }, ['⏳ Waiting for Players...']),
            createElement('div', { class: 'countdown-display' }, [
                createElement('div', { class: 'countdown-number' }, [
                    (state.countdownroom || 20).toString()
                ]),
            ]),
            createElement('p', { class: 'subtitle' }, [state.statusMessage]),

            createElement('div', { class: 'message-container' }, [
                state.errorMessage ? createElement('div', { class: 'error-message' }, [state.errorMessage]) : null,
            ].filter(Boolean)),

            createElement('div', { class: 'players-list' }, [
                createElement('h3', {}, ['Players in lobby:']),
                ...(state.players || []).map(player =>
                    createElement('div', { class: 'player-item', key: player.id }, [
                        // createElement('span', { class: `player-status-dot ${player.connected ? 'online' : 'offline'}` }),
                        `🎮 ${player.name}${player.name === state.playerName ? ' (You)' : ''}`
                    ])
                )
            ].filter(Boolean)),
            createElement('div', { class: 'loading-indicator' }, [
                createElement('div', { class: 'spinner' })
            ]),
            createElement('div', { class: 'button-group' }, [
                createElement('button', {
                    class: 'btn btn-secondary',
                    on: {
                        click: () => {
                            // emitFn('resetGame');
                            emitFn('leaveRoom');
                        },
                    }
                }, ['Back to Menu'])
            ]),
            createElement('div', { class: 'chat-container' }, [
                createElement('h3', { class: 'chat-container-title' }, ['Lobby Chat']),
                renderChatMessages(state),
                createElement('div', { class: 'chat-input-container' }, [
                    createElement('input', {
                        type: 'text',
                        placeholder: 'Type your message here...',
                        maxlength: '20',
                        value: state.chatInput,
                        on: {
                            input: (e) => emitFn('updateChatInput', e.target.value),
                            keydown: (e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const message = e.target.value.trim();
                                    if (message) {
                                        emitFn('sendChatMessage', message);
                                    }
                                }
                            }
                        }
                    }),
                    createElement('button', {
                        class: 'chat-send-btn',
                        on: {
                            click: () => {
                                const message = state.chatInput.trim();
                                if (message) {
                                    emitFn('sendChatMessage', message);
                                }
                            }
                        }
                    }, ['Send'])
                ]),
            ])
        ])
    ]);
}

function renderCountdown(state, emitFn) {
    return createElement('div', { class: 'menu-container' }, [
        createElement('div', { class: 'menu-form' }, [
            createElement('h1', { class: 'welcome-title' }, ['🚀 Game Starting!']),
            createElement('div', { class: 'countdown-display' }, [
                createElement('div', { class: 'countdown-number' }, [state.countdown.toString()]),
                createElement('p', { class: 'countdown-text' }, ['Get ready to battle!'])
            ]),
            createElement('div', { class: 'players-list' }, [
                createElement('h3', {}, ['Players:']),
                ...state.players.map(player =>
                    createElement('div', { class: 'player-item', key: player.id }, [
                        // createElement('span', { class: `player-status-dot ${player.connected ? 'online' : 'offline'}` }),
                        `🎮 ${player.name}${player.name === state.playerName ? ' (You)' : ''}`
                    ])
                )
            ])
        ])
    ]);
}

function renderGameTile(state, i, j) {
    const cellValue = state.board[i] ? state.board[i][j] : 0;
    let tileClass = 'tile';

    if (cellValue === 2) tileClass += ' wall';
    else if (cellValue === 1) tileClass += ' block';

    const hasExplosion = state.explosions && state.explosions.some(expl => expl.x === j && expl.y === i);
    if (hasExplosion) tileClass += ' explosion';

    const children = [];

    state.powerUps.forEach(powerUp => {
        if (powerUp.x === j && powerUp.y === i) {
            children.push(createElement('div', {
                class: `power-up power-up-${powerUp.type}`,
                title: powerUp.type,
                key: `powerup-${powerUp.id}`
            }));
        }
    });

    state.bombs.forEach(bomb => {
        if (bomb.x === j && bomb.y === i) {
            children.push(createElement('div', {
                class: 'bomb',
                title: 'Bomb',
                key: `bomb-${bomb.playerId}-${bomb.x}-${bomb.y}-${bomb.timestamp}`
            }));
        }
    });

    return createElement('div', { class: tileClass, key: `tile-${i}-${j}` }, children);
}

function renderPlayerStats(state) {
    if (!state.currentPlayer) return null;

    const player = state.currentPlayer;
    return createElement('div', { class: 'player-stats card' }, [
        createElement('h3', {}, [`${player.name} (You)`]),
        createElement('div', { class: 'stats-grid' }, [
            createElement('div', { class: 'stat' }, [
                createElement('span', { class: 'stat-label' }, ['❤️ Lives:']),
                createElement('span', { class: 'stat-value' }, [player.lives.toString()])
            ]),
            createElement('div', { class: 'stat' }, [
                createElement('span', { class: 'stat-label' }, ['💣 Bombs:']),
                createElement('span', { class: 'stat-value' }, [player.bombCount.toString()])
            ]),
            createElement('div', { class: 'stat' }, [
                createElement('span', { class: 'stat-label' }, ['🔥 Flame:']),
                createElement('span', { class: 'stat-value' }, [player.flameSize.toString()])
            ]),
            createElement('div', { class: 'stat' }, [
                createElement('span', { class: 'stat-label' }, ['⚡ Speed:']),
                createElement('span', { class: 'stat-value' }, [player.speed.toString()])
            ])
        ])
    ]);
}

function updatePlayer(emitFn) {
    let direction = null;

    if (keysPressed['ArrowUp']) direction = 'up';
    else if (keysPressed['ArrowDown']) direction = 'down';
    else if (keysPressed['ArrowRight']) direction = 'right';
    else if (keysPressed['ArrowLeft']) direction = 'left';
    else if (keysPressed[' ']) emitFn('placeBomb');
    else if (keysPressed['c'] || keysPressed['C']) emitFn('toggleChat');

    if (direction) {
        emitFn('sendMove', direction);
    }
}

function renderGame(state, emitFn) {
    setupKeyboardControls(emitFn);
    startGameLoop(emitFn);

    const gridChildren = [];
    for (let i = 0; i < state.gridSize; i++) {
        for (let j = 0; j < state.gridSize; j++) {
            gridChildren.push(renderGameTile(state, i, j));
        }
    }

    state.players.forEach((player, i) => {
        if (player.lives > 0) {
            gridChildren.push(createElement('div', {
                class: `player player-${i + 1}`,
                title: player.name,
                key: `player-${player.id}`,
                style: `transform: translate(${player.pixelX}px, ${player.pixelY}px)`
            }));
        }
    });

    return createElement('div', { class: 'game-screen' }, [
        createElement('div', { class: 'game-header card' }, [
            createElement('div', { class: 'game-info' }, [
                createElement('h2', {}, ['💣 Bomberman']),
                createElement('p', {}, [`Players Alive: ${state.players.filter(p => p.alive).length}/${state.players.length}`]),
                createElement('p', { class: 'fps-counter' }, [`FPS: ${state.fps}`])
            ]),
            createElement('div', { class: 'game-controls' }, [
                createElement('button', {
                    class: 'btn btn-small btn-icon',
                    on: { click: () => emitFn('toggleChat') }
                }, ['💬 Chat']),
                createElement('button', {
                    class: 'btn btn-small btn-secondary btn-icon',
                    on: {
                        click: () => {
                            removeKeyboardControls();
                            stopGameLoop();
                            emitFn('leaveGame');
                        }
                    }
                }, ['🚪 Leave'])
            ])
        ]),

        createElement('div', { class: 'game-main' }, [
            createElement('div', { class: 'game-grid', autofocus: true }, gridChildren),

            createElement('div', { class: 'game-sidebar' }, [
                renderPlayerStats(state),

                createElement('div', { class: 'other-players card' }, [
                    createElement('h4', {}, ['Other Players']),
                    ...state.players
                        .filter(p => p.name !== state.playerName)
                        .map(player =>
                            createElement('div', {
                                class: `other-player ${!player.alive ? 'dead' : ''}`,
                                key: player.id
                            }, [
                                createElement('span', { class: `player-status-dot ${player.alive ? 'online' : 'offline'}` }),
                                createElement('span', { class: 'player-name' }, [player.name]),
                                createElement('span', { class: 'player-lives' }, [`❤️ ${player.lives}`])
                            ])
                        )
                ]),

                createElement('div', { class: 'controls-help card' }, [
                    createElement('h4', {}, ['Controls']),
                    createElement('p', {}, [
                        createElement('span', { class: 'key-hint' }, ['WASD']),
                        ' or ',
                        createElement('span', { class: 'key-hint' }, ['Arrow Keys']),
                        ': Move'
                    ]),
                    createElement('p', {}, [
                        createElement('span', { class: 'key-hint' }, ['Space']),
                        ': Place Bomb'
                    ]),
                    createElement('p', {}, [
                        createElement('span', { class: 'key-hint' }, ['C']),
                        ': Toggle Chat'
                    ])
                ])
            ])
        ]),

        renderChat(state, emitFn)
    ]);
}

function renderGameOver(state, emitFn) {
    removeKeyboardControls();
    stopGameLoop();

    const winnerName = state.gameWinner ? state.gameWinner.name : 'No one';
    const isWinner = state.gameWinner && state.gameWinner.name === state.playerName;

    return createElement('div', { class: 'menu-container' }, [
        createElement('div', { class: 'menu-form' }, [
            createElement('h1', { class: 'welcome-title' }, ['🎮 Game Over!']),
            createElement('div', { class: 'winner-announcement' }, [
                createElement('h2', {
                    class: isWinner ? 'winner-text' : 'loser-text'
                }, [
                    isWinner ? '🎉 You Won! 🎉' : `Winner: ${winnerName}`
                ]),
                isWinner ?
                    createElement('p', { class: 'winner-message' }, ['Congratulations! You are the last player standing!']) :
                    createElement('p', { class: 'loser-message' }, ['Better luck next time!'])
            ]),
            createElement('div', { class: 'final-stats card' }, [
                createElement('h3', {}, ['Final Results']),
                ...state.players.map(player =>
                    createElement('div', {
                        class: `final-player ${player.alive ? 'winner' : 'eliminated'}`,
                        key: player.id
                    }, [
                        createElement('span', { class: `player-status-icon ${player.alive ? 'icon-winner' : 'icon-eliminated'}` }),
                        `${player.name} - ${player.alive ? 'Winner' : 'Eliminated'} (Lives: ${player.lives})`
                    ])
                )
            ]),
            createElement('div', { class: 'button-group' }, [
                createElement('button', {
                    class: 'btn btn-primary',
                    on: {
                        click: () => emitFn('resetGame')
                    }
                }, ['🔄 Play Again'])
            ])
        ])
    ]);
}

function view(state, emitFn) {
    switch (state.screen) {
        case 'waiting':
            return renderWaiting(state, emitFn);
        case 'countdown':
            return renderCountdown(state, emitFn);
        case 'game':
            return renderGame(state, emitFn);
        case 'gameOver':
            return renderGameOver(state, emitFn);
        default:
            return renderMenu(state, emitFn);
    }
}

appStateManager.subscribe(() => {
    requestAnimationFrame(() => {
        const newState = appStateManager.getState();
        currentVNode = render(view(newState, appEmit), appContainer, currentVNode);
    });
});

setTimeout(() => {
    console.log('Attempting initial connection to server...');
    appEmit('connectToServer');
}, 2000);

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        window.blur()
        removeKeyboardControls();
    }
});

window.addEventListener('beforeunload', () => {
    stopGameLoop();
    removeKeyboardControls();
});

appStateManager.setState(initialState);