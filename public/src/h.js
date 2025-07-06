export function CreateElement(tag, props = {}, children = []) {
    return {
        tag,
        props,
        type: "element",
        children: mapTextNodes(withoutNulls(children)),
    }
}

export function CreateElementText(str) {
    return {
        type: "text",
        value: str
    }
}

export function CreateElementFragment(vNodes) {
    return {
        type: "fragment",
        children: mapTextNodes(withoutNulls(vNodes)),
    }
}

function mapTextNodes(children) {
    return children.map((child) => {
        if (typeof child === 'string') {
            return CreateElementText(child)
        } else {
            return child
        }
    })
}

function withoutNulls(arr) {
    return arr.filter((item) => item != null)
}