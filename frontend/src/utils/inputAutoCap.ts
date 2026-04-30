export const noAutoCapInputProps = {
  autoCorrect: 'off' as const,
  spellCheck: false,
};

export const applyNoAutoCapAttributes = (element: Element) => {
  const tagName = String((element as Element | null)?.tagName || '').toUpperCase();
  if (tagName !== 'INPUT' && tagName !== 'TEXTAREA') {
    return;
  }

  if (typeof element.removeAttribute === 'function') {
    element.removeAttribute('autocapitalize');
  }
  element.setAttribute('autocorrect', 'off');
  element.setAttribute('spellcheck', 'false');
};

export const applyNoAutoCapAttributesWithin = (root: ParentNode | null | undefined) => {
  if (!root || typeof root.querySelectorAll !== 'function') {
    return;
  }

  root.querySelectorAll('input, textarea').forEach((element) => {
    applyNoAutoCapAttributes(element);
  });
};
