import { mountDOM } from './mount-dom.js'
import { destroyDOM } from './destroy-dom.js'
import { setAttributes } from './attributes.js'
import { addEventListeners } from './events.js'

export function diffAndPatch(oldVdom, newVdom, parentEl) {
    if (!oldVdom) {
        mountDOM(newVdom, parentEl);
        return newVdom;
    }

    if (!newVdom) {
        destroyDOM(oldVdom);
        return null;
    }

    if (oldVdom.type !== newVdom.type) {
        const oldEl = oldVdom.el;
        destroyDOM(oldVdom);
        mountDOM(newVdom, parentEl);
        
        if (oldEl && oldEl.parentNode) {
            oldEl.parentNode.replaceChild(newVdom.el, oldEl);
        }
        
        return newVdom;
    }

    switch (oldVdom.type) {
        case 'text':
            return patchText(oldVdom, newVdom);
        case 'element':
            return patchElement(oldVdom, newVdom);
        case 'fragment':
            return patchFragment(oldVdom, newVdom);
        default:
            throw new Error(`Unknown vdom type: ${oldVdom.type}`);
    }
}

function patchText(oldVdom, newVdom) {
    if (oldVdom.value !== newVdom.value) {
        oldVdom.el.textContent = newVdom.value;
    }
    
    newVdom.el = oldVdom.el;
    return newVdom;
}

function patchElement(oldVdom, newVdom) {
    const el = oldVdom.el;
    newVdom.el = el;

    patchAttributes(oldVdom.props, newVdom.props, el);
    patchEventListeners(oldVdom, newVdom, el);
    patchChildren(oldVdom.children, newVdom.children, el);

    return newVdom;
}

function patchAttributes(oldProps, newProps, el) {
    Object.keys(oldProps).forEach(name => {
        if (name === 'on' || name === 'key') return;
        if (!(name in newProps)) {
            if (name === 'class') {
                el.className = '';
            } else if (name === 'style') {
                el.style.cssText = '';
            } else {
                el.removeAttribute(name);
            }
        }
    });

    Object.entries(newProps).forEach(([name, value]) => {
        if (name === 'on' || name === 'key') return;
        if (oldProps[name] !== value) {
            setAttributes(el, { [name]: value });
        }
    });
}

function patchEventListeners(oldVdom, newVdom, el) {
    const oldListeners = oldVdom.props.on || {};
    const newListeners = newVdom.props.on || {};

    if (oldVdom.listeners) {
        Object.keys(oldListeners).forEach(eventName => {
            if (!(eventName in newListeners)) {
                el.removeEventListener(eventName, oldVdom.listeners[eventName]);
            }
        });
    }

    newVdom.listeners = addEventListeners(newListeners, el);
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
            diffAndPatch(oldChild, newChild, parentEl);
        }
    }
}

function patchFragment(oldVdom, newVdom) {
    newVdom.el = oldVdom.el;
    patchChildren(oldVdom.children, newVdom.children, oldVdom.el);
    return newVdom;
}