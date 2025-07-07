import { removeEventListeners } from './events.js'

export function destroyDOM(vdom) {
    switch (vdom.type) {
        case "text":
            if (vdom.el && vdom.el.parentNode) {
                vdom.el.remove();
            }
            break;
        case "element":
            if (vdom.listeners) {
                removeEventListeners(vdom.listeners, vdom.el);
            }
            vdom.children.forEach(destroyDOM);
            if (vdom.el && vdom.el.parentNode) {
                vdom.el.remove();
            }
            break;
        case "fragment":
            vdom.children.forEach(destroyDOM);
            break;
        default:
            throw new Error(`Can't destroy DOM of type: ${vdom.type}`);
    }
    delete vdom.el;
}