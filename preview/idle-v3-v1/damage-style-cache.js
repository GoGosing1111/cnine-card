// Pixi 8.20 keys auto-generated stroked bitmap fonts by TextStyle uid/tick.
// Reusing V3's damage pool still creates a font atlas after every style setter.
// In this long-running preview only, share identical solid-color damage styles
// by their content. No font, color, size, stroke, layout or V3 source is changed.
(() => {
  const properties = ['align', 'breakWords', 'fontFamily', 'fontSize', 'fontStyle', 'fontVariant', 'fontWeight',
    'leading', 'letterSpacing', 'lineHeight', 'padding', 'textBaseline', 'trim', 'whiteSpace', 'wordWrap', 'wordWrapWidth'];
  function damageStyleKey(style) {
    // Read Pixi's normalized solid paints, not the raw fill object (which can
    // contain a circular Texture when a TextStyle is cloned).
    const fill = style._fill;
    const stroke = style._stroke;
    return 'idle-v3-damage:' + JSON.stringify([
      ...properties.map(key => style[key]), fill ? [fill.color, fill.alpha, fill.fill?.styleKey] : null,
      stroke ? [stroke.color, stroke.alpha, stroke.width, stroke.alignment, stroke.cap, stroke.join, stroke.miterLimit, stroke.fill?.styleKey] : null,
      style.dropShadow
    ]);
  }
  function install(engine) {
    const pool = engine?.pools?.damage;
    if (!pool || pool.__idleStyleCache) return;
    const keys = new Set();
    const decorate = view => {
      for (const label of [view.numberGlow, view.numberLabel, view.roleTag, view.criticalLabel,
        view.healLabel, view.hitLabel, ...(view.speedHitLabels || [])]) {
        const style = label?.style;
        if (!style || Object.hasOwn(style, 'styleKey')) continue;
        Object.defineProperty(style, 'styleKey', {configurable: true, get() {
          const key = damageStyleKey(this); keys.add(key); return key;
        }});
      }
      return view;
    };
    const factory = pool.factory;
    pool.factory = () => decorate(factory());
    [...pool.available, ...pool.inUse].forEach(decorate);
    pool.__idleStyleCache = {keys};
  }
  window.IdleDamageStyleCache = {install, damageStyleKey};
})();
