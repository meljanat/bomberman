export function setAttributes(el, attrs) {
    const { class: className, style, ...otherAttrs } = attrs;
    
    if (className) {
        el.className = typeof className === 'string' ? className : '';
    }
    
    if (style) {
        Object.entries(style).forEach(([prop, value]) => {
            el.style[prop] = value;
        });
    }
    
    for (const [name, value] of Object.entries(otherAttrs)) {
        if (value == null) {
            el[name] = null;
            el.removeAttribute(name);
        } else if (name.startsWith('data-')) {
            el.setAttribute(name, value);
        } else {
            el[name] = value;
        }
    }
}
