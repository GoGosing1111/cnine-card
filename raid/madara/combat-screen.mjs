// Keep the battle outside the lobby's width, overflow and stacking contexts.
export function createMadaraCombatScreen(surface) {
  const doc = surface.ownerDocument, win = doc.defaultView;
  let position = null, previousFocus = null, scroll = null, locked = [], disposed = false;
  const attrs = ['role', 'aria-modal', 'aria-label', 'tabindex'];
  let previousAttrs = [];

  function release() {
    if (!position) return;
    surface.classList.remove('mr-fullscreen');
    previousAttrs.forEach(([key, value]) => value === null ? surface.removeAttribute(key) : surface.setAttribute(key, value));
    for (const [element, inert] of locked) element.inert = inert;
    locked = [];
    doc.body.style.overflow = scroll.bodyOverflow;
    doc.documentElement.style.overflow = scroll.htmlOverflow;
    if (position.isConnected) position.replaceWith(surface);
    else surface.remove();
    position = null;
    win.scrollTo({ left: scroll.x, top: scroll.y, behavior: 'instant' });
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }

  function setActive(active) {
    if (!active) { release(); return; }
    if (disposed || position || !surface.isConnected) return;
    previousFocus = doc.activeElement;
    previousAttrs = attrs.map(key => [key, surface.getAttribute(key)]);
    scroll = { x: win.scrollX, y: win.scrollY, bodyOverflow: doc.body.style.overflow, htmlOverflow: doc.documentElement.style.overflow };
    position = doc.createComment('madara-lobby-position');
    surface.before(position);
    doc.body.appendChild(surface);
    locked = [...doc.body.children].filter(element => element !== surface && !['SCRIPT', 'STYLE', 'LINK'].includes(element.tagName)).map(element => [element, element.inert]);
    for (const [element] of locked) element.inert = true;
    doc.body.style.overflow = 'hidden';
    doc.documentElement.style.overflow = 'hidden';
    surface.classList.add('mr-fullscreen');
    surface.setAttribute('role', 'dialog');
    surface.setAttribute('aria-modal', 'true');
    surface.setAttribute('aria-label', '바르센 레이드 전투');
    surface.setAttribute('tabindex', '-1');
    surface.scrollTop = 0;
    surface.focus({ preventScroll: true });
  }

  const escape = event => {
    if (position && event.key === 'Escape' && !surface.querySelector('dialog[open]')) {
      event.preventDefault();
      surface.querySelector('[data-madara-id="leaveButton"]').click();
    }
  };
  doc.addEventListener('keydown', escape);
  return { setActive, destroy() { disposed = true; doc.removeEventListener('keydown', escape); release(); } };
}
