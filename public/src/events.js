export function addEventListeners(listeners = {}, el) {
    const addedListeners = {};
    Object.entries(listeners).forEach(([eventName, handler]) => {
        const property = 'on' + eventName;
        el[property] = handler;
        addedListeners[eventName] = handler;
    });
    return addedListeners;
}

export function removeEventListeners(listeners = {}, el) {
    Object.keys(listeners).forEach(eventName => {
        const property = 'on' + eventName;
        el[property] = null;
    });
}