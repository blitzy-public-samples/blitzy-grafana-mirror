// Node.closest() polyfill
if (typeof window !== 'undefined' && 'Element' in window && !Element.prototype.closest) {
  Element.prototype.closest = function (this: Element & { document?: Document }, s: string) {
    // Some legacy environments expose a non-standard `document` property; fall back to ownerDocument.
    const root = this.document || this.ownerDocument;
    const matches = root.querySelectorAll(s);
    let el: Element | null = this;
    let i: number;
    // eslint-disable-next-line
    do {
      i = matches.length;
      // eslint-disable-next-line
      while (--i >= 0 && matches.item(i) !== el) {}
      el = el!.parentElement;
    } while (i < 0 && el);
    return el;
  };
}

export function getPreviousCousin(node: HTMLElement, selector: string) {
  let sibling = node.parentElement?.previousSibling;
  let el;
  while (sibling) {
    if (sibling instanceof HTMLElement) {
      el = sibling.querySelector(selector);
    }
    if (el) {
      return el;
    }
    sibling = sibling.previousSibling;
  }
  return undefined;
}

export function getNextCharacter(global?: typeof globalThis) {
  const selection = (global || window).getSelection();
  if (!selection || !selection.anchorNode) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const text = selection.anchorNode.textContent;
  const offset = range.startOffset;
  return text!.slice(offset, offset + 1);
}
