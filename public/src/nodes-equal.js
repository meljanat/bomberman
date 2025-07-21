// Updated nodes-equal.js - Add key comparison
import { DOM_TYPES } from './h.js'

export function areNodesEqual(nodeOne, nodeTwo) {
  if (nodeOne.type !== nodeTwo.type) {
    return false
  }

  if (nodeOne.type === DOM_TYPES.ELEMENT) {
    const { tag: tagOne, props: propsOne } = nodeOne
    const { tag: tagTwo, props: propsTwo } = nodeTwo
    
    // If both have keys, compare them
    if (propsOne?.key != null && propsTwo?.key != null) {
      return tagOne === tagTwo && propsOne.key === propsTwo.key
    }
    
    // If only one has a key, they're not equal
    if (propsOne?.key != null || propsTwo?.key != null) {
      return false
    }
    
    return tagOne === tagTwo
  }

  return true
}

// Updated arraysDiffSequence function in arrays.js
export function arraysDiffSequence(
  oldArray,
  newArray,
  equalsFn = (a, b) => a === b
) {
  const sequence = []
  const array = new ArrayWithOriginalIndices(oldArray, equalsFn)

  for (let index = 0; index < newArray.length; index++) {
    if (array.isRemoval(index, newArray)) {
      sequence.push(array.removeItem(index))
      index--
      continue
    }

    if (array.isNoop(index, newArray)) {
      sequence.push(array.noopItem(index))
      continue
    }

    const item = newArray[index]

    if (array.isAddition(item, index)) {
      sequence.push(array.addItem(item, index))
      continue
    }
    
    sequence.push(array.moveItem(item, index))
  }

  sequence.push(...array.removeItemsAfter(newArray.length))

  return sequence
}

// Updated h function to handle keys
export function h(tag, props = {}, children = []) {
  const { key, ...otherProps } = props
  
  return {
    tag,
    props: otherProps,
    key, // Store key separately for easier access
    children: mapTextNodes(withoutNulls(children)),
    type: DOM_TYPES.ELEMENT,
  }
}