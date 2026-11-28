/** Creates an element with a class and optional text. The one helper the components share. */
export function h<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
