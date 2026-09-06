import { Application, Graphics } from 'pixi.js';
import { gsap } from 'gsap';

async function mount(host, card, signal) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  if (!host?.isConnected || signal?.aborted || reduced.matches) return null;
  const app = new Application();
  let destroyed = false, ready = false, observer, entrance, clock = 0;
  const targets = [...card.querySelectorAll('.pc-trophy.is-owned img')];
  const cleanups = [];
  function destroy() {
    if (destroyed) return;
    destroyed = true; observer?.disconnect(); entrance?.kill();
    gsap.killTweensOf(targets); targets.forEach(t => { t.style.transform = ''; });
    cleanups.forEach(fn => fn());
    if (ready) { app.stop(); app.destroy(true, { children: true }); }
  }
  signal?.addEventListener('abort', destroy, { once: true });
  cleanups.push(() => signal?.removeEventListener('abort', destroy));
  try {
    await app.init({ width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight), backgroundAlpha: 0, antialias: true,
      resolution: Math.min(2, devicePixelRatio || 1), autoDensity: true, preference: 'webgl', autoStart: false });
    ready = true;
    if (destroyed || !host.isConnected) { app.destroy(true, { children: true }); return null; }
    host.appendChild(app.canvas); app.ticker.maxFPS = 30;
    const light = new Graphics(); app.stage.addChild(light);
    function paint() {
      const w = app.screen.width, h = app.screen.height, length = 2 * (w + h - 12);
      light.clear();
      const point = d => { d = ((d % length) + length) % length; if (d < w - 6) return [3 + d, 3]; d -= w - 6; if (d < h - 6) return [w - 3, 3 + d]; d -= h - 6; if (d < w - 6) return [w - 3 - d, h - 3]; return [3, h - 3 - (d - w + 6)]; };
      for (let arm = 0; arm < 2; arm++) for (let j = 0; j < 34; j++) {
        const [x, y] = point(clock * 110 + arm * length / 2 - j * 3);
        light.circle(x, y, j ? 1.1 : 2).fill({ color: arm ? 0xb2dded : 0xe9d8b6, alpha: (1 - j / 34) * .58 });
      }
    }
    app.ticker.add(ticker => { clock += Math.min(ticker.deltaMS, 50) / 1000; paint(); });
    const sync = () => {
      if (destroyed) return;
      if (document.hidden || reduced.matches) { app.stop(); entrance?.pause(); }
      else { app.start(); entrance?.resume(); }
      if (reduced.matches) { gsap.killTweensOf(targets); targets.forEach(t => { t.style.transform = ''; }); }
    };
    document.addEventListener('visibilitychange', sync); reduced.addEventListener('change', sync);
    cleanups.push(() => document.removeEventListener('visibilitychange', sync), () => reduced.removeEventListener('change', sync));
    observer = new ResizeObserver(() => { if (!destroyed) { app.renderer.resize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight)); paint(); } }); observer.observe(host);
    // Animate only decoration: text, awards, controls and results never depend on a tween completing.
    entrance = gsap.fromTo(targets, { y: 10, scale: .96 }, { y: 0, scale: 1, duration: .75, stagger: .09, ease: 'power3.out', clearProps: 'transform' });
    targets.forEach(target => {
      const button = target.closest('button');
      const over = () => { if (!reduced.matches) gsap.to(target, { y: -4, scale: 1.055, duration: .3, ease: 'power2.out' }); };
      const out = () => gsap.to(target, { y: 0, scale: 1, duration: .35, clearProps: 'transform' });
      button.addEventListener('pointerenter', over); button.addEventListener('pointerleave', out); button.addEventListener('focus', over); button.addEventListener('blur', out);
      cleanups.push(() => { button.removeEventListener('pointerenter', over); button.removeEventListener('pointerleave', out); button.removeEventListener('focus', over); button.removeEventListener('blur', out); });
    });
    sync(); return { destroy };
  } catch { destroy(); return null; }
}
globalThis.PlayerCardFX = Object.freeze({ mount });
