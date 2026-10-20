// Reuse the existing preview-only, read-only static server and its path allowlist.
process.env.HALLOWEEN_PREVIEW_PORT=process.env.PRIME_PREVIEW_PORT||'8864';
await import('../mercenary-halloween-battle-20261014-v1/serve.mjs');
console.log('Prime Requiem: http://127.0.0.1:'+process.env.HALLOWEEN_PREVIEW_PORT+'/preview/prime-requiem-blood-skills-20261021-v1/');
