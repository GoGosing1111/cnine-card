// Opt-in ONLY for an occluded/background automation window. Chromium can cap
// iframe rAF at 1 FPS there even while document.visibilityState is "visible".
// Keep the real V3/GSAP timelines running in that harness without focusing a
// window. Ordinary preview visits use the native scheduler unchanged.
if (parent !== window && new URLSearchParams(parent.location.search).get('backgroundQa') === '1') {
  window.requestAnimationFrame = callback => setTimeout(() => callback(performance.now()), 16);
  window.cancelAnimationFrame = id => clearTimeout(id);
  window.__idleBackgroundQaClock = true;
}
