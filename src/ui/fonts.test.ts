import { describe, expect, it } from 'vitest'
import { loadFonts } from './fonts'

const links = (doc: Document) => [...doc.querySelectorAll('link')]

/**
 * A detached document reports readyState 'loading', so say explicitly which
 * state each case is about rather than relying on that.
 */
function documentAt(readyState: DocumentReadyState) {
  const doc = document.implementation.createHTMLDocument()
  Object.defineProperty(doc, 'readyState', { value: readyState, configurable: true })
  return doc
}

describe('loadFonts', () => {
  it('adds the stylesheet and its preconnects once the page is up', () => {
    const doc = documentAt('complete')
    loadFonts(doc)

    const added = links(doc)
    expect(added).toHaveLength(3)
    expect(added.filter((l) => l.rel === 'preconnect')).toHaveLength(2)
    const sheet = added.find((l) => l.rel === 'stylesheet')
    expect(sheet?.href).toContain('fonts.googleapis.com')
    expect(sheet?.href).toContain('display=swap')
  })

  it('waits for load rather than holding it up', () => {
    const doc = documentAt('loading')
    const target = new EventTarget()
    loadFonts(doc, target)

    expect(links(doc)).toHaveLength(0)
    target.dispatchEvent(new Event('load'))
    expect(links(doc)).toHaveLength(3)
  })

  it('does not add them twice', () => {
    const doc = documentAt('complete')
    loadFonts(doc)
    loadFonts(doc)
    expect(links(doc)).toHaveLength(3)
  })

  it('marks the font-file host as anonymous, as the spec requires', () => {
    const doc = documentAt('complete')
    loadFonts(doc)
    const gstatic = links(doc).find((l) => l.href.includes('fonts.gstatic.com'))
    expect(gstatic?.crossOrigin).toBe('anonymous')
  })
})
