function createElement(tag, attrs = {}, children = []) {
  return { tag, attrs, children };
}

function setAttributes(el, attrs = {}) {
  Object.keys(attrs).forEach(key => {
    if (key === 'on' && typeof attrs[key] === 'object' && attrs[key] !== null) {
      Object.keys(attrs[key]).forEach(eventName => {
        if (typeof attrs[key][eventName] === 'function') {
          el.addEventListener(eventName, attrs[key][eventName]);
        }
      });
    } else if (key.startsWith('on') && typeof attrs[key] === 'function') {
      const eventName = key.toLowerCase().substring(2);
      el.addEventListener(eventName, attrs[key]);
    } else if (key in el) {
      el[key] = attrs[key];
    } else {
      el.setAttribute(key, attrs[key]);
    }
  });
}

function updateAttributes(el, oldAttrs = {}, newAttrs = {}) {

  if (oldAttrs.on && typeof oldAttrs.on === 'object') {
    Object.keys(oldAttrs.on).forEach(eventName => {
      if (typeof oldAttrs.on[eventName] === 'function' && (!newAttrs.on || !newAttrs.on[eventName] || oldAttrs.on[eventName] !== newAttrs.on[eventName])) {
        el.removeEventListener(eventName, oldAttrs.on[eventName]);
      }
    });
  }

  Object.keys(oldAttrs).forEach(key => {
    if (!(key in newAttrs)) {
      if (key.startsWith('on') && typeof oldAttrs[key] === 'function') {
        const eventName = key.toLowerCase().substring(2);
        el.removeEventListener(eventName, oldAttrs[key]);
      } else if (key in el) {
        el[key] = '';
      } else {
        el.removeAttribute(key);
      }
    }
  });

  Object.keys(newAttrs).forEach(key => {
    if (key === 'on' && typeof newAttrs[key] === 'object' && newAttrs[key] !== null) {
      Object.keys(newAttrs[key]).forEach(eventName => {
        if (typeof newAttrs[key][eventName] === 'function' && oldAttrs.on?.[eventName] !== newAttrs[key][eventName]) {
          if (oldAttrs.on?.[eventName] && typeof oldAttrs.on[eventName] === 'function') {
              el.removeEventListener(eventName, oldAttrs.on[eventName]);
          }
          el.addEventListener(eventName, newAttrs[key][eventName]);
        }
      });
    } else if (newAttrs[key] !== oldAttrs[key]) {
      if (key.startsWith('on') && typeof newAttrs[key] === 'function') {
        const eventName = key.toLowerCase().substring(2);
        if (typeof oldAttrs[key] === 'function') {
            el.removeEventListener(eventName, oldAttrs[key]);
        }
        el.addEventListener(eventName, newAttrs[key]);
      } else if (key in el) {
        el[key] = newAttrs[key];
      } else {
        el.setAttribute(key, newAttrs[key]);
      }
    }
  });
}

function render(vnode, parent, oldNode = null) {
  if (!vnode) {
    if (oldNode) {
      parent.removeChild(oldNode);
    }
    return null;
  }

  if (!oldNode) {
    const el = createElementNode(vnode);
    parent.appendChild(el);
    vnode._el = el;
    return el;
  }

  if (oldNode.nodeName.toLowerCase() !== vnode.tag.toLowerCase()) {
    const el = createElementNode(vnode);
    parent.replaceChild(el, oldNode);
    vnode._el = el;
    return el;
  }

  updateAttributes(oldNode, oldNode._vnode?.attrs || {}, vnode.attrs);

  vnode._el = oldNode;
  oldNode._vnode = vnode;

  updateChildren(oldNode, vnode.children || [], oldNode.childNodes);

  return oldNode;
}

function createElementNode(vnode) {
  const el = document.createElement(vnode.tag);

  if (vnode.attrs && vnode.attrs.key != null) {
    el.setAttribute('data-key', vnode.attrs.key);
  }

  setAttributes(el, vnode.attrs);

  (vnode.children || []).forEach(child => {
    if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child));
    } else {
      const childEl = createElementNode(child);
      el.appendChild(childEl);
      child._el = childEl;
    }
  });

  vnode._el = el;
  el._vnode = vnode;
  return el;
}

function updateChildren(parentEl, newVChildren = [], oldDomChildren = []) {
  const keyedOld = {};

  Array.from(oldDomChildren).forEach(domChild => {
    const k = domChild._vnode?.attrs?.key;
    if (k != null) keyedOld[k] = domChild;
  });

  let newDomChildren = [];

  newVChildren.forEach((newVChild, idx) => {
    if (newVChild == null) return;

    let newDom;

    if (typeof newVChild === 'string') {
      const oldDomChild = oldDomChildren[idx];
      if (oldDomChild && oldDomChild.nodeType === Node.TEXT_NODE) {
        if (oldDomChild.textContent !== newVChild) {
          oldDomChild.textContent = newVChild;
        }
        newDom = oldDomChild;
      } else {
        newDom = document.createTextNode(newVChild);
      }
    } else {
      const key = newVChild.attrs?.key;
      const oldDomChild = key != null ? keyedOld[key] : oldDomChildren[idx];
      newDom = render(newVChild, parentEl, oldDomChild);
      if (key != null) delete keyedOld[key];
    }

    newDomChildren.push(newDom);
  });

  newDomChildren.forEach((domChild, i) => {
    const current = parentEl.childNodes[i];
    if (domChild && domChild !== current) {
      parentEl.insertBefore(domChild, current || null);
    }
  });

  while (parentEl.childNodes.length > newDomChildren.length) {
    parentEl.removeChild(parentEl.lastChild);
  }

  Object.values(keyedOld).forEach(orphan => {
    if (orphan.parentNode === parentEl) {
      parentEl.removeChild(orphan);
    }
  });
}


function eventsKey() {
  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2);
  return `k_${timePart}_${randomPart}`;
}

function createStateManager(initialState = {}) {
  let state = initialState;
  let listeners = [];

  function setState(newState) {
    const changes = {};
    Object.keys(newState).forEach(key => {
      if (state[key] !== newState[key]) {
        changes[key] = newState[key];
      }
    });

    if (Object.keys(changes).length === 0) return;

    state = { ...state, ...changes };

    // Notify listeners about specific changes
    Object.keys(changes).forEach(key => {
      listeners.forEach(listener => {
        if (listener.key === key || !listener.key) {
          listener.fn(changes[key], key);
        }
      });
    });
  }

  function getState() {
    return state;
  }

  function subscribe(keyOrFn, fn) {
    if (typeof keyOrFn === 'function') {
      listeners.push({ fn: keyOrFn });
      keyOrFn(state);
    } else {
      listeners.push({ key: keyOrFn, fn });
      fn(state[keyOrFn]);
    }
  }

  return { setState, getState, subscribe };
}

const eventManager = {
  events: {},

  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
  },

  off(event, callback) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(cb => cb !== callback);
  },

  trigger(event, ...args) {
    if (this.events[event]) {
      this.events[event].forEach(cb => cb(...args));
    }
  }
};

function createRouter() {
  const routes = {};

  function addRoute(path, callback) {
    routes[path] = callback;
  }

  function navigate(path) {
    if (window.location.hash.slice(1) !== path) {
      window.location.hash = path;
    }
    if (routes[path]) {
      routes[path]();
    }
  }

  function initRoute() {
    const path = window.location.hash.slice(1) || '/';
    if (routes[path]) {
      routes[path]();
    }

    window.onhashchange = function () {
      const currentPath = window.location.hash.slice(1) || '/';
      if (routes[currentPath]) {
        routes[currentPath]();
      }
    };
  }

  return { addRoute, navigate, initRoute };
}

export { createElement, render, createStateManager, eventManager, createRouter, eventsKey };
