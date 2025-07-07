import { mountDOM } from './mount-dom.js'
import { destroyDOM } from './destroy-dom.js'
import { setAttributes } from './attributes.js'
import { addEventListeners, removeEventListeners} from './events.js'

export function patchDOM(oldVdom, newVdom, parentEl) {
    if (!oldVdom) {
        mountDOM(newVdom, parentEl);
        return;
    }

    if (!newVdom) {
        destroyDOM(oldVdom);
        return;
    }

    if (oldVdom.type !== newVdom.type) {
        const nextSibling = oldVdom.el.nextSibling;
        destroyDOM(oldVdom);
        mountDOM(newVdom, parentEl);
        if (nextSibling) {
            parentEl.insertBefore(newVdom.el, nextSibling);
        }
        return;
    }

    newVdom.el = oldVdom.el;

    switch (newVdom.type) {
        case "text":
            patchText(oldVdom, newVdom);
            break;
        case "element":
            patchElement(oldVdom, newVdom);
            break;
        case "fragment":
            patchFragment(oldVdom, newVdom);
            break;
    }
}

function patchText(oldVdom, newVdom) {
    if (oldVdom.value !== newVdom.value) {
        oldVdom.el.nodeValue = newVdom.value;
    }
}

function patchElement(oldVdom, newVdom) {
    const el = oldVdom.el;

    patchAttributes(oldVdom.props, newVdom.props, el);

    if (oldVdom.listeners) {
        removeEventListeners(oldVdom.listeners, el);
    }
    const { on: events} = newVdom.props;
    newVdom.listeners = addEventListeners(events, el);

    patchChildren(oldVdom.children, newVdom.children, el);
}

function patchFragment(oldVdom, newVdom) {
    patchChildren(oldVdom.children, newVdom.children, oldVdom.el);
}

function patchChildren(oldChildren, newChildren, parentEl) {
    const maxLength = Math.max(oldChildren.length, newChildren.length);

    for (let i = 0; i < maxLength; i++) {
        const oldChild = oldChildren[i];
        const newChild = newChildren[i];

        if (!oldChild && newChild) {
            mountDOM(newChild, parentEl);
        } else if (oldChild && !newChild) {
            destroyDOM(oldChild);
        } else if (oldChild && newChild) {
            patchDOM(oldChild, newChild, parentEl);
        }
    }
}

function patchAttributes(oldProps, newProps, el) {
    const { on: oldEvents, ...oldAttrs } = oldProps;
    const { on: newEvents, ...newAttrs } = newProps;

    Object.keys(oldAttrs).forEach(key => {
        if (!(key in newAttrs)) {
            if (key === 'class') {
                el.className = '';
            } else if (key.startsWith('data-')) {
                el.removeAttribute(key);
            } else {
                el.removeAttribute(key);
                if (key in el) {
                    el[key] = null;
                }
            }
        }
    });

    setAttributes(el, newAttrs);
}