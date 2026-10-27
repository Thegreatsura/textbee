import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeAll, describe, expect, it } from 'vitest'
import { patchDomForTranslation } from './translate-safe-dom'

// Mimics Chrome Translate: each text node is replaced by <font><font>text</font></font>.
function translate(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  nodes.forEach((node) => {
    const outer = document.createElement('font')
    const inner = document.createElement('font')
    inner.textContent = node.nodeValue
    outer.appendChild(inner)
    node.parentNode!.replaceChild(outer, node)
  })
}

describe('patchDomForTranslation', () => {
  beforeAll(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    patchDomForTranslation()
    patchDomForTranslation()
  })

  it('ignores removing a node the parent no longer holds', () => {
    const parent = document.createElement('div')
    const stray = document.createTextNode('gone')
    expect(parent.removeChild(stray)).toBe(stray)
  })

  it('still removes real children', () => {
    const parent = document.createElement('div')
    const child = parent.appendChild(document.createElement('span'))
    parent.removeChild(child)
    expect(parent.childNodes).toHaveLength(0)
  })

  it('appends when the reference node was moved away', () => {
    const parent = document.createElement('div')
    parent.appendChild(document.createElement('i'))
    const stray = document.createTextNode('gone')
    const node = document.createElement('b')
    parent.insertBefore(node, stray)
    expect(parent.lastChild).toBe(node)
  })

  it('still inserts before a real reference node', () => {
    const parent = document.createElement('div')
    const ref = parent.appendChild(document.createElement('i'))
    const node = document.createElement('b')
    parent.insertBefore(node, ref)
    expect(parent.firstChild).toBe(node)
  })

  it('lets React swap translated text for an element without throwing', () => {
    let toggle!: () => void
    function Badge() {
      const [done, setDone] = useState(false)
      toggle = () => setDone(true)
      return (
        <span>
          Step {done ? <svg data-testid='check' /> : 'one'}
        </span>
      )
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(<Badge />))

    translate(container)
    expect(() => act(() => toggle())).not.toThrow()
    expect(container.querySelector('[data-testid="check"]')).not.toBeNull()

    act(() => root.unmount())
    container.remove()
  })
})
