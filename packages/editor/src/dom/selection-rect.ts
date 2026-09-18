export type ClientBox = {top: number; left: number; width: number; height: number}

export function clientBoxFromRects(a: DOMRect, b?: DOMRect): ClientBox {
    if (!b) return {top: a.top, left: a.left, width: a.width, height: Math.max(1, a.height)}
    let left = Math.min(a.left, b.left)
    let top = Math.min(a.top, b.top)
    let right = Math.max(a.right, b.right)
    let bottom = Math.max(a.bottom, b.bottom)
    return {top, left, width: right - left, height: Math.max(1, bottom - top)}
}
