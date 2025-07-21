import { CreateElement } from './src/h.js'
import { createApp } from './src/app.js'

let socket = null;
let animationId = null;
let lastFrameTime = 0;
let frameCount = 0;
let fpsDisplay = 0;
let TILE_SIZE = 60;
let movementInterval = null;

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

const reducers = {
    updatePlayerName: (state, name) => ({
        ...state,
        playerName: name,
    }),

    updateChatInput: (state, message) => ({
        ...state,
        chatInput: message
    }),

    toggleChat: (state) => ({
        ...state,
        showChat: !state.showChat
    }),

    sendChatMessage: (state, message) => {
        const messageToSend = message || state.chatInput;
        if (socket && socket.readyState === WebSocket.OPEN && messageToSend.trim()) {
            socket.send(JSON.stringify({
                type: 'message',
                message: messageToSend.trim()
            }));
            return {
                ...state,
                chatInput: ''
            };
        }
        return state;
    },

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

    updateFPS: (state, fps) => ({
        ...state,
        fps: fps
    }),

    connectToServer: (state) => {
        if (socket && socket.readyState === WebSocket.OPEN)
            return { ...state, connected: true };

        if (socket && socket.readyState === WebSocket.CONNECTING) {
            return { ...state, connecting: true };
        }
        try {
            socket = new WebSocket('ws://localhost:8888');

            socket.addEventListener('open', () => {
                localStorage.setItem('bomberman', 'active_tab')
                if (window.appEmit) {
                    window.appEmit('connectionEstablished');
                }
            });

            socket.addEventListener('message', (event) => {
                const data = JSON.parse(event.data);
                if (window.appEmit) {
                    window.appEmit('handleServerMessage', data);
                }
            });

            socket.addEventListener('close', () => {
                localStorage.removeItem('bomberman')

                if (window.appEmit) {
                    window.appEmit('connectionLost');
                }
            });

            socket.addEventListener('error', (error) => {
                localStorage.removeItem('bomberman')
                console.error('WebSocket error:', error);
                if (window.appEmit) {
                    window.appEmit('setError', 'Failed to connect to server');
                }
            });

            return { ...state, connecting: true, errorMessage: '' };
        } catch (error) {
            // console.error('Error creating WebSocket:', error);
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
        statusMessage: '',
        currentPlayer: null,
        messages: []
    }),

    startGame: (state) => {
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
            return {
                ...state,
                errorMessage: 'Not connected to server. Please wait and try again.'
            };
        }
    },

    handleServerMessage: (state, data) => {
        switch (data.type) {
            case 'error':
                return {
                    ...state,
                    errorMessage: data.message,
                    statusMessage: ''
                };

            case 'gameState':
                const newState = {
                    ...state,
                    players: data.players || state.players,
                    bombs: data.bombs || state.bombs,
                    powerUps: data.powerUps || state.powerUps,
                    board: data.board || state.board,
                    statusMessage: '',
                    errorMessage: ''
                };

                if (data.players) {
                    const currentPlayer = data.players.find(p => p.name === state.playerName);
                    newState.currentPlayer = currentPlayer;
                }

                if (data.state === 'waiting') {
                    newState.screen = 'waiting';
                    newState.isCountingDownRoom = true;
                    newState.countdownroom = data.secondsroom || 20;
                    newState.statusMessage = `Waiting for players... (${data.players.length}/4)`;
                } else if (data.state === 'countdown') {
                    newState.screen = 'countdown';
                    newState.isCountingDownRoom = false;
                    newState.isCountingDown = true;
                    newState.countdown = data.countdown || 10;
                } else if (data.state === 'playing') {
                    newState.screen = 'game';
                    newState.isCountingDown = false;
                }

                return newState;

            case 'playerJoined':
                return {
                    ...state,
                    players: data.players,
                    screen: 'waiting',
                    isCountingDownRoom: true,
                    countdownroom: data.secondsroom,
                    statusMessage: `Waiting for players... (${data.players.length}/4)`,
                    currentPlayer: data.players.find(p => p.name === state.playerName)
                };

            case 'playerLeft':
                return {
                    ...state,
                    players: data.players,
                    statusMessage: `Waiting for players... (${data.players.length}/4)`,
                };

            case 'countdown':
                return {
                    ...state,
                    screen: 'countdown',
                    isCountingDown: true,
                    countdown: data.seconds
                };

            case 'waiting':
                return {
                    ...state,
                    screen: 'waiting',
                    isCountingDownRoom: true,
                    countdownroom: data.secondsroom || data.countdownroom || 20,
                    statusMessage: `Waiting for players... (${state.players.length}/4)`
                };

            case 'gameStart':
                return {
                    ...state,
                    screen: 'game',
                    isCountingDown: false,
                    players: data.players,
                    bombs: data.bombs,
                    powerUps: data.powerUps,
                    board: data.board,
                    statusMessage: 'Game started!'
                };

            case 'playerMoved':
                return {
                    ...state,
                    players: data.players,
                    currentPlayer: data.players.find(p => p.name === state.playerName)
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
                    board: data.board,
                    powerUps: data.powerUps,
                    explosions: data.explosions || [],
                    currentPlayer: data.players.find(p => p.name === state.playerName)
                };

            case 'powerUpCollected':
                return {
                    ...state,
                    players: data.players,
                    powerUps: data.powerUps,
                    currentPlayer: data.players.find(p => p.name === state.playerName)
                };

            case 'newMessage':
                return {
                    ...state,
                    messages: [...(state.messages || []), data.message]
                };

            case 'messageHistory':
                return {
                    ...state,
                    messages: data.messages || []
                };

            case 'gameOver':
                return {
                    ...state,
                    screen: 'gameOver',
                    gameWinner: data.winner
                };

            case 'gameReset':
                return {
                    ...initialState,
                    connected: state.connected,
                    playerName: state.playerName,
                    statusMessage: 'Game has been reset. You can join a new game.',
                    errorMessage: '',
                    screen: 'menu',
                };
            
            case 'playerDead':
                return {
                    ...initialState,
                    connected: state.connected,
                    playerName: state.playerName,
                    statusMessage: '',
                    errorMessage: 'You lost try again',
                    screen: 'menu',
                }

            case 'chatHistory':
                return {
                    ...state,
                    messages: data.messages || []
                };

            default:
                return state;
        }
    },

    sendMove: (state, direction) => {
        if (socket && socket.readyState === WebSocket.OPEN && state.screen === 'game') {
            socket.send(JSON.stringify({ type: 'move', direction }));
        }
        return state;
    },

    placeBomb: (state) => {
        if (socket && socket.readyState === WebSocket.OPEN && state.screen === 'game') {
            socket.send(JSON.stringify({ type: 'placeBomb' }));
        }
        return state;
    },

    clearExplosions: (state) => ({
        ...state,
        explosions: []
    }),

    resetGame: (state) => ({
        ...initialState,
        connected: state.connected,
        playerName: state.playerName,
        statusMessage: 'Game has been reset. You can join a new game.',
        errorMessage: '',
        screen: 'menu',
        messages: []
    }),

    leaveGame: (state) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'leaveGame' }));
        }
        return state;
    },
    leaveRoom: (state) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'leaveRoom' }));
        }
        return state;
    }
};

let keyHandler = null;
let keysPressed = new Set();

const keyUpHandler = (event) => {
    keysPressed.delete(event.key.toLowerCase());
    if (!hasMovementKey() && movementInterval) {
        clearInterval(movementInterval);
        movementInterval = null;
    }
};

function hasMovementKey() {
    const movementKeys = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'z', 's', 'q', 'd'];
    return Array.from(keysPressed).some(key => movementKeys.includes(key));
}

function getDirectionFromKeys() {
    if (keysPressed.has('arrowup') || keysPressed.has('z')) return 'up';
    if (keysPressed.has('arrowdown') || keysPressed.has('s')) return 'down';
    if (keysPressed.has('arrowleft') || keysPressed.has('q')) return 'left';
    if (keysPressed.has('arrowright') || keysPressed.has('d')) return 'right';
    return null;
}

function setupKeyboardControls(emit) {
    if (keyHandler) {
        document.removeEventListener('keydown', keyHandler);
        document.removeEventListener('keyup', keyUpHandler);
    }

    keyHandler = (event) => {
        if (document.activeElement && document.activeElement.tagName === 'INPUT') {
            return;
        }
        const key = event.key.toLowerCase();
        if (key === ' ') {
            event.preventDefault();
            emit('placeBomb');
            return;
        }
        if (key === 'c') {
            event.preventDefault();
            emit('toggleChat');
            return;
        }
        const movementKeys = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'z', 's', 'q', 'd'];
        if (movementKeys.includes(key)) {
            event.preventDefault();

            if (!keysPressed.has(key)) {
                keysPressed.add(key);

                // Start continuous movement if not already started
                if (!movementInterval) {
                    movementInterval = setInterval(() => {
                        const direction = getDirectionFromKeys();
                        if (direction) {
                            emit('sendMove', direction);
                        } else {
                            clearInterval(movementInterval);
                            movementInterval = null;
                        }
                    }, 50); // Send movement every 50ms for smooth movement
                }
            }
        }
    };

    document.addEventListener('keydown', keyHandler);
    document.addEventListener('keyup', keyUpHandler);
}

function removeKeyboardControls() {
    if (keyHandler) {
        document.removeEventListener('keydown', keyHandler);
        document.removeEventListener('keyup', keyUpHandler);
        keyHandler = null;
        keysPressed.clear();

        if (movementInterval) {
            clearInterval(movementInterval);
            movementInterval = null;
        }
    }
}

function startGameLoop(emit) {
    function gameLoop(currentTime) {
        if (currentTime - lastFrameTime >= 1000) {
            fpsDisplay = frameCount;
            frameCount = 0;
            lastFrameTime = currentTime;
            emit('updateFPS', fpsDisplay);
        }
        frameCount++;

        if (Math.random() < 0.1) {
            emit('clearExplosions');
        }

        getDirectionFromKeys();
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
        return CreateElement('div', { class: 'chat-empty' }, ['No messages yet...']);
    }
    return CreateElement('div', { class: 'chat-messages' },
        state.messages.map(msg =>
            CreateElement('div', { class: 'chat-message' }, [
                CreateElement('span', { class: 'chat-sender' }, [`${msg.sender}: `]),
                CreateElement('span', { class: 'chat-text' }, [msg.text])
            ])
        )
    );
}

function renderChat(state, emit) {
    if (!state.showChat) return null;
    return CreateElement('div', { class: 'chat-container' }, [
        CreateElement('div', { class: 'chat-header' }, [
            CreateElement('h3', {}, ['Chat']),
            CreateElement('button', {
                class: 'chat-close',
                on: { click: () => emit('toggleChat') }
            }, ['×'])
        ]),
        renderChatMessages(state),
        CreateElement('div', { class: 'chat-input-container' }, [
            CreateElement('input', {
                type: 'text',
                placeholder: 'Type your message...',
                maxlength: '20',
                value: state.chatInput,
                on: {
                    input: (e) => emit('updateChatInput', e.target.value),
                    keydown: (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            const message = e.target.value.trim();
                            if (message) {
                                emit('sendChatMessage', message);
                                e.target.value = '';
                            }
                        }
                    }
                }
            }),
            CreateElement('button', {
                class: 'chat-send-btn',
                on: {
                    click: (e) => {
                        const input = e.target.parentElement.querySelector('input');
                        const message = input.value.trim();
                        if (message) {
                            emit('sendChatMessage', message);
                            input.value = '';
                        }
                    }
                }
            }, ['Send'])
        ])
    ]);
}

function renderMenu(state, emit) {
    const canJoin = state.playerName.trim() && state.connected && !state.connecting;
    const buttonText = state.connecting ? 'Connecting...' :
        !state.connected ? 'Connecting...' :
            'Join Game';

    return CreateElement('div', { class: 'menu-container' }, [
        CreateElement('div', { class: 'menu-form' }, [
            CreateElement('h1', { class: 'welcome-title' }, ['💣 Bomberman Game 💣']),
            CreateElement('p', { class: 'subtitle' }, ['Enter your name to join the battle!']),

            CreateElement('div', { class: 'message-container'}, [
                state.errorMessage ? CreateElement('div', { class: 'error-message' }, [state.errorMessage].filter(Boolean)) : null,
                state.statusMessage ? CreateElement('div', { class: 'status-message' }, [state.statusMessage].filter(Boolean)) : null,
            ].filter(Boolean)),

            CreateElement('div', { class: 'input-group' }, [
                CreateElement('label', { class: 'input-label' }, ['Player Name:']),
                CreateElement('input', {
                    type: 'text',
                    class: 'name-input',
                    placeholder: 'Enter your name...',
                    value: state.playerName,
                    maxlength: '20',
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
                        click: () => {
                            emit('updatePlayerName', '')
                        }
                    }
                }, ['Clear']),
                !state.connected && !state.connecting ? CreateElement('button', {
                    class: 'btn btn-secondary',
                    on: {
                        click: () => emit('connectToServer')
                    }
                }, ['Reconnect']) : null
            ].filter(Boolean))
        ])
    ]);
}

function renderWaiting(state, emit) {
    return CreateElement('div', { class: 'menu-container' }, [
        CreateElement('div', { class: 'menu-form' }, [
            CreateElement('div', {}, [

                CreateElement('h1', { class: 'welcome-title' }, ['⏳ Waiting for Players...']),
                CreateElement('div', { class: 'countdown-display' }, [
                    CreateElement('div', { class: 'countdown-number' }, [
                        (state.countdownroom || 20).toString()
                    ]),
                ]),
                CreateElement('p', { class: 'subtitle' }, [state.statusMessage]),

                CreateElement('div', { class: 'message-container' }, [
                    state.errorMessage ? CreateElement('div', { class: 'error-message' }, [state.errorMessage]) : null,
                ].filter(Boolean)),

                CreateElement('div', { class: 'players-list' }, [
                    CreateElement('h3', {}, ['Players in lobby:'].filter(Boolean)),
                    ...(state.players || []).map(player =>
                        CreateElement('div', { class: 'player-item' }, [
                            `🎮 ${player.name}${player.name === state.playerName ? ' (You)' : ''}`
                        ].filter(Boolean))
                    )
                ].filter(Boolean)),
                CreateElement('div', { class: 'loading-indicator' }, [
                    CreateElement('div', { class: 'spinner' })
                ]),
                CreateElement('div', { class: 'button-group' }, [
                    CreateElement('button', {
                        class: 'btn btn-secondary',
                        on: {
                            click: () => {
                                emit('resetGame');
                                emit('leaveRoom');
                            },
                        }
                    }, ['Back to Menu'])
                ]),
            ]),

            CreateElement('div', {}, [
                renderChatMessages(state),

                CreateElement('div', { class: 'chat-input-container' }, [
                    CreateElement('input', {
                        type: 'text',
                        placeholder: 'Type your message here...',
                        maxlength: '20',
                        on: {
                            keydown: (e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const message = e.target.value.trim();
                                    if (message) {
                                        emit('sendChatMessage', message);
                                        e.target.value = '';
                                    }
                                }
                            }
                        }
                    }),
                    CreateElement('button', {
                        class: 'chat-send-btn',
                        on: {
                            click: (e) => {
                                const input = e.target.parentElement.querySelector('input');
                                const message = input.value.trim();
                                if (message) {
                                    emit('sendChatMessage', message);
                                    input.value = '';
                                }
                            }
                        }
                    }, ['Send'])
                ]),

                CreateElement('div', { class: 'chat-status' }, ['Connected • Ready to chat'])
            ]),
        ])
    ]);
}

function renderCountdown(state, emit) {
    return CreateElement('div', { class: 'menu-container' }, [
        CreateElement('div', { class: 'menu-form' }, [
            CreateElement('h1', { class: 'welcome-title' }, ['🚀 Game Starting!']),
            CreateElement('div', { class: 'countdown-display' }, [
                CreateElement('div', { class: 'countdown-number' }, [state.countdown.toString()]),
                CreateElement('p', { class: 'countdown-text' }, ['Get ready to battle!'])
            ]),
            CreateElement('div', { class: 'players-list' }, [
                CreateElement('h3', {}, ['Players:']),
                ...state.players.map(player =>
                    CreateElement('div', { class: 'player-item' }, [
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
            children.push(CreateElement('div', {
                class: `power-up ${powerUp.type}`,
                title: powerUp.type
            }));
        }
    });

    state.bombs.forEach(bomb => {
        if (bomb.x === j && bomb.y === i) {
            children.push(CreateElement('div', {
                class: 'bomb',
                title: 'Bomb'
            }));
        }
    });

    return CreateElement('div', { class: tileClass }, children);
}

function renderPlayerStats(state) {
    if (!state.currentPlayer) return null;

    const player = state.currentPlayer;
    return CreateElement('div', { class: 'player-stats' }, [
        CreateElement('h3', {}, [`${player.name} (You)`]),
        CreateElement('div', { class: 'stats-grid' }, [
            CreateElement('div', { class: 'stat' }, [
                CreateElement('span', { class: 'stat-label' }, ['❤️ Lives:']),
                CreateElement('span', { class: 'stat-value' }, [player.lives.toString()])
            ]),
            CreateElement('div', { class: 'stat' }, [
                CreateElement('span', { class: 'stat-label' }, ['💣 Bombs:']),
                CreateElement('span', { class: 'stat-value' }, [player.bombCount.toString()])
            ]),
            CreateElement('div', { class: 'stat' }, [
                CreateElement('span', { class: 'stat-label' }, ['🔥 Flame:']),
                CreateElement('span', { class: 'stat-value' }, [player.flameSize.toString()])
            ]),
            CreateElement('div', { class: 'stat' }, [
                CreateElement('span', { class: 'stat-label' }, ['⚡ Speed:']),
                CreateElement('span', { class: 'stat-value' }, [player.speed.toString()])
            ])
        ])
    ]);
}

function renderPlayers(state) {
    return state.players.map((player, i) => {
        if (player.lives <= 0) return null;

        const pixelX = player.pixelX !== undefined ? player.pixelX : (player.x * TILE_SIZE);
        const pixelY = player.pixelY !== undefined ? player.pixelY : (player.y * TILE_SIZE);

        return CreateElement('div', {
            class: `player-${i + 1}`,
            style: {
                position: 'absolute',
                left: `${(pixelX + 7)}px`,
                top: `${(pixelY + 7)}px`,
                width: `${TILE_SIZE}px`,
                height: `${TILE_SIZE}px`,
                transform: 'none',
                transition: 'left 0.05s linear, top 0.05s linear',
                zIndex: '10'
            },
            title: player.name
        });
    }).filter(Boolean);
}

function renderGame(state, emit) {
    setupKeyboardControls(emit);
    startGameLoop(emit);

    const gridChildren = [];
    for (let i = 0; i < state.gridSize; i++) {
        for (let j = 0; j < state.gridSize; j++) {
            gridChildren.push(renderGameTile(state, i, j));
        }
    }

    return CreateElement('div', { class: 'game-container' }, [
        CreateElement('div', { class: 'game-header' }, [
            CreateElement('div', { class: 'game-info' }, [
                CreateElement('h2', {}, ['💣 Bomberman']),
                CreateElement('p', {}, [`Players Alive: ${state.players.filter(p => p.alive).length}/${state.players.length}`]),
                CreateElement('p', { class: 'fps-counter' }, [`FPS: ${state.fps}`])
            ]),
            CreateElement('div', { class: 'game-controls' }, [
                CreateElement('button', {
                    class: 'btn btn-small',
                    on: { click: () => emit('toggleChat') }
                }, ['💬 Chat']),
                CreateElement('button', {
                    class: 'btn btn-small btn-secondary',
                    on: {
                        click: () => {
                            removeKeyboardControls();
                            stopGameLoop();
                            emit('leaveGame');
                        }
                    }
                }, ['🚪 Leave'])
            ])
        ]),

        CreateElement('div', { class: 'game-main' }, [
            CreateElement('div', {
                class: 'game-grid-container',
                style: {
                    position: 'relative',
                    width: `${(state.gridSize * TILE_SIZE) + 20}px`,
                    height: `${(state.gridSize * TILE_SIZE) + 20}px`,
                    margin: '0 auto',
                    border: '2px solid #333',
                    overflow: 'hidden'
                }
            }, [
                CreateElement('div', {
                    class: 'game-grid',
                    style: {
                        display: 'grid',
                        gridTemplateColumns: `repeat(${state.gridSize}, ${TILE_SIZE}px)`,
                        gridTemplateRows: `repeat(${state.gridSize}, ${TILE_SIZE}px)`,
                        gap: '0',
                        width: '100%',
                        height: '100%'
                    }
                }, gridChildren),
                ...renderPlayers(state)
            ]),

            CreateElement('div', { class: 'game-sidebar' }, [
                renderPlayerStats(state),

                CreateElement('div', { class: 'other-players' }, [
                    CreateElement('h4', {}, ['Other Players']),
                    ...state.players
                        .filter(p => p.name !== state.playerName)
                        .map(player =>
                            CreateElement('div', {
                                class: `other-player ${!player.alive ? 'dead' : ''}`
                            }, [
                                CreateElement('span', { class: 'player-name' }, [player.name]),
                                CreateElement('span', { class: 'player-lives' }, [`❤️ ${player.lives}`])
                            ])
                        )
                ]),

                CreateElement('div', { class: 'controls-help' }, [
                    CreateElement('h4', {}, ['Controls']),
                    CreateElement('p', {}, ['Arrow Keys / ZQSD: Move']),
                    CreateElement('p', {}, ['Space: Place Bomb']),
                    CreateElement('p', {}, ['C: Toggle Chat'])
                ])
            ])
        ]),

        renderChat(state, emit)
    ]);
}


function renderGameOver(state, emit) {
    removeKeyboardControls();
    stopGameLoop();

    const winnerName = state.gameWinner ? state.gameWinner.name : 'No one';
    const isWinner = state.gameWinner && state.gameWinner.name === state.playerName;

    return CreateElement('div', { class: 'menu-container' }, [
        CreateElement('div', { class: 'menu-form' }, [
            CreateElement('h1', { class: 'welcome-title' }, ['🎮 Game Over!']),
            CreateElement('div', { class: 'winner-announcement' }, [
                CreateElement('h2', {
                    class: isWinner ? 'winner-text' : 'loser-text'
                }, [
                    isWinner ? '🎉 You Won! 🎉' : `Winner: ${winnerName}`
                ].filter(Boolean)),
                isWinner ?
                    CreateElement('p', { class: 'winner-message' }, ['Congratulations! You are the last player standing!']) :
                    CreateElement('p', { class: 'loser-message' }, ['Better luck next time!'])
            ].filter(Boolean)),
            CreateElement('div', { class: 'final-stats' }, [
                CreateElement('h3', {}, ['Final Results']),
                ...state.players.map(player =>
                    CreateElement('div', {
                        class: `final-player ${player.alive ? 'winner' : 'eliminated'}`
                    }, [
                        `${player.alive ? '👑' : '💀'} ${player.name} - ${player.alive ? 'Winner' : 'Eliminated'} (Lives: ${player.lives})`
                    ].filter(Boolean))
                )
            ].filter(Boolean)),
            CreateElement('div', { class: 'button-group' }, [
                CreateElement('button', {
                    class: 'btn btn-primary',
                    on: {
                        click: () => emit('resetGame')
                    }
                }, ['🔄 Play Again'])
            ])
        ])
    ]);
}

function view(state, emit) {
    switch (state.screen) {
        case 'waiting':
            return renderWaiting(state, emit);
        case 'countdown':
            return renderCountdown(state, emit);
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
}, 2000);

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // stopGameLoop();
        removeKeyboardControls();
    } else if (window.appEmit) {
        const state = app.getState();
        if (state && state.screen === 'game') {
            startGameLoop(window.appEmit);
        }
    }
});

window.addEventListener('beforeunload', () => {
    stopGameLoop();
    removeKeyboardControls();
});

window.addEventListener('resize', () => {
    const el = document.querySelector('.tile.wall');
    if (el) {
        const width = el.offsetWidth;
        const height = el.offsetHeight;
        TILE_SIZE = width;
        socket.send(JSON.stringify({ type: 'resize', width, height }));
    }
});