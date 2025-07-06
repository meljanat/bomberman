import { setAttributes } from './attributes.js'
import { addEventListeners } from './events.js'

export function mountDOM(vdom, parentEl) {
    switch (vdom.type) {
        case "text":
            createTextNode(vdom, parentEl);
            break;
        case "element":
            createElementNode(vdom, parentEl);
            break;
        case "fragment":
            createFragmentNodes(vdom, parentEl);
            break;
        default:
            throw new Error(`Can't mount DOM of type: ${vdom.type}`);
    }
}

function createTextNode(vdom, parentEl) {
    const textNode = document.createTextNode(vdom.value);
    vdom.el = textNode;
    parentEl.appendChild(textNode);
}

function createFragmentNodes(vdom, parentEl) {
    vdom.el = parentEl;
    vdom.children.forEach(child => mountDOM(child, parentEl));
}

function createElementNode(vdom, parentEl) {
    const { tag, props, children } = vdom;
    const element = document.createElement(tag);

    const { on: events, ...attrs } = props;
    vdom.listeners = addEventListeners(events, element);
    setAttributes(element, attrs);

    vdom.el = element;
    children.forEach(child => mountDOM(child, element));
    parentEl.appendChild(element);
}