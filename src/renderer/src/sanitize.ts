// Sanitize HTML tu Airbnb (mo ta, noi quy...) — chi giu tag dinh dang co ban,
// bo moi attribute va tag nguy hiem (script/style/iframe/on*...). An toan voi CSP.
const ALLOWED = new Set(['BR', 'B', 'STRONG', 'I', 'EM', 'U', 'P', 'UL', 'OL', 'LI', 'SPAN', 'DIV'])

export function sanitizeHtml(html: string): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')

  const walk = (node: Node) => {
    const children = Array.from(node.childNodes)
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element
        if (!ALLOWED.has(el.tagName)) {
          // tag khong cho phep -> thay bang noi dung text ben trong
          const text = doc.createTextNode(el.textContent || '')
          el.replaceWith(text)
          continue
        }
        // bo het attribute (onclick, style, href, ...)
        for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name)
        walk(el)
      }
    }
  }
  walk(doc.body)
  return doc.body.innerHTML
}
