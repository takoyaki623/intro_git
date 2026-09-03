const HREF =
  'https://fonts.googleapis.com/css2?family=DotGothic16&family=M+PLUS+Rounded+1c:wght@400;700&display=swap'

function inject(doc: Document): void {
  if (doc.querySelector(`link[href="${HREF}"]`)) return

  for (const [rel, href, crossOrigin] of [
    ['preconnect', 'https://fonts.googleapis.com', undefined],
    ['preconnect', 'https://fonts.gstatic.com', 'anonymous'],
    ['stylesheet', HREF, undefined],
  ] as const) {
    const link = doc.createElement('link')
    link.rel = rel
    link.href = href
    if (crossOrigin) link.crossOrigin = crossOrigin
    doc.head.append(link)
  }
}

/**
 * Pull in the webfonts once the page has finished loading.
 *
 * A stylesheet in the markup blocks the first paint until the font host
 * answers, and one added while the document is still loading holds up the load
 * event instead -- either way a slow or unreachable font server stalls the
 * game. Waiting for load means the page is painted and playable in the
 * fallback stack first, and simply keeps it if the fonts never arrive.
 */
export function loadFonts(doc: Document = document, target: EventTarget = window): void {
  if (doc.readyState === 'complete') {
    inject(doc)
    return
  }
  target.addEventListener('load', () => inject(doc), { once: true })
}
