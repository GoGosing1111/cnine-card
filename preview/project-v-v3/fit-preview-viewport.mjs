import {preferredFrameHeight} from './source/battle/ViewportLayout.mjs';

// Same-origin preview frames use content height. Full-screen game modals keep
// their own shell and card dock; the common engine fits their available canvas.
const frame = window.frameElement;
if (frame) {
  // Only dedicated canvas wrappers own the frame height. An editor section can
  // also contain controls and a log, so its height must remain content-driven.
  const viewport = frame.parentElement.matches('[data-v3-fit-container], .battle-viewport, .stage-viewport, .viewport') ? frame.parentElement : frame;
  const initialHeight = viewport.style.height;
  let shell, raf, owned = false, disposed = false;
  const fit = () => {
    if (disposed || !shell?.isConnected) return;
    const header = shell.querySelector('.battle-v3-header')?.getBoundingClientRect();
    const dock = shell.querySelector('.battle-v3-dock')?.getBoundingClientRect();
    const canvasHost = shell.querySelector('.battle-v3-canvas-host'), host = canvasHost?.getBoundingClientRect();
    if (!header?.height || !dock?.height || !host) return;
    if (parent.document.fullscreenElement?.contains(frame)) {
      if (owned) viewport.style.height = initialHeight;
      return;
    }
    const status = shell.querySelector('.battle-v3-status');
    const top = status && getComputedStyle(status).display !== 'none' ? Math.max(0, status.getBoundingClientRect().bottom - host.top) : 8;
    const height = preferredFrameHeight({width: frame.clientWidth, header: header.height, dock: dock.height, notice: top + Number(canvasHost.dataset.v3FormationExtraTop || 0)});
    if (height) {owned = true; viewport.style.height = `${height}px`;}
    else if (owned) {viewport.style.height = initialHeight; owned = false;}
  };
  const schedule = () => {cancelAnimationFrame(raf); raf = requestAnimationFrame(fit);};
  const sizes = new ResizeObserver(schedule);
  const bind = () => {
    const next = document.querySelector('.battle-v3-live-shell');
    if (next === shell) return;
    shell = next; sizes.disconnect();
    if (!shell) return;
    for (const node of [frame, ...shell.querySelectorAll('.battle-v3-header,.battle-v3-dock,.battle-v3-status')]) sizes.observe(node);
    schedule();
  };
  const mounts = new MutationObserver(bind);
  mounts.observe(document.body, {childList: true, subtree: true});
  parent.document.addEventListener('fullscreenchange', schedule);
  window.addEventListener('resize', schedule);
  document.addEventListener('v3-formation-resize', schedule);
  window.addEventListener('pagehide', () => {
    disposed = true; mounts.disconnect(); sizes.disconnect(); cancelAnimationFrame(raf);
    parent.document.removeEventListener('fullscreenchange', schedule);
  }, {once: true});
  bind();
}
