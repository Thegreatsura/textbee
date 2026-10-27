// Page translators replace React's text nodes, so these guards stop React DOM updates from throwing.

const PATCHED = Symbol.for('textbee.translateSafeDom')

export function patchDomForTranslation() {
  if (typeof Node !== 'function' || !Node.prototype) return
  const proto = Node.prototype as Node & { [PATCHED]?: boolean }
  if (proto[PATCHED]) return
  proto[PATCHED] = true

  const originalRemoveChild = proto.removeChild
  proto.removeChild = function <T extends Node>(this: Node, child: T): T {
    // Already moved by the translator, so there is nothing left to remove.
    if (child.parentNode !== this) return child
    return originalRemoveChild.call(this, child) as T
  }

  const originalInsertBefore = proto.insertBefore
  proto.insertBefore = function <T extends Node>(
    this: Node,
    node: T,
    child: Node | null
  ): T {
    // Append rather than drop the node when the reference node is gone.
    if (child && child.parentNode !== this) {
      return originalInsertBefore.call(this, node, null) as T
    }
    return originalInsertBefore.call(this, node, child) as T
  }
}
