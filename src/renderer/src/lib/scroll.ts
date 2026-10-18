const reduced = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Scroll `container` so `el` is visible, touching nothing else. Unlike
 * Element.scrollIntoView, which scrolls every scrollable ancestor (even
 * overflow:hidden ones) and can shift the whole app shell.
 */
export function scrollWithin(container: Element, el: Element, align: 'start' | 'center' = 'start', smooth = true): void {
  const c = container.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  const delta = align === 'center' ? r.top - c.top - (c.height - r.height) / 2 : r.top - c.top - 16
  container.scrollBy({ top: delta, behavior: smooth && !reduced() ? 'smooth' : 'auto' })
}
