// Local preview diagnostics only; reports never leave this browser.
window.addEventListener('error',event=>console.error('[Apocalypse review]',event.error?.stack||event.message));
window.addEventListener('unhandledrejection',event=>console.error('[Apocalypse review promise]',event.reason?.stack||String(event.reason)));
