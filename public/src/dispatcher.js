export function createDispatcher() {
    const subs = new Map();
    const afterHandlers = [];

    function subscribe(commandName, handler) {
        if (!subs.has(commandName)) {
            subs.set(commandName, []);
        }
        const handlers = subs.get(commandName);
        if (handlers.includes(handler)) {
            return () => {};
        }
        handlers.push(handler);
        return () => {
            const idx = handlers.indexOf(handler);
            handlers.splice(idx, 1);
        };
    }

    function afterEveryCommand(handler) {
        afterHandlers.push(handler);
        return () => {
            const idx = afterHandlers.indexOf(handler);
            afterHandlers.splice(idx, 1);
        };
    }

    function dispatch(commandName, payload) {
        if (subs.has(commandName)) {
            subs.get(commandName).forEach(handler => handler(payload));
        }
        afterHandlers.forEach(handler => handler());
    }

    return { subscribe, afterEveryCommand, dispatch };
}