export const GAME_ORIGIN = 'https://cnine-card.pages.dev';
export const MANIFEST_PATH = '/client/windows/manifest.json';
export const CLIENT_VERSION = '0.1.10';
export const MAX_MANIFEST_BYTES = 12 * 1024 * 1024;
export const MAX_ASSET_BYTES = 512 * 1024 * 1024;
export const CACHE_BUDGET = 4 * 1024 ** 3;
export const PUBLIC_ROOTS = new Set(['assets','css','data','equipment-forge','equipment-polish','events','js','loot-shop','master-star-mine','mercenary-codex','mercenary-hangar','miracle-cube','organization','pet-codex','pets','preview','pve-v3','pve','raid','shared','ui']);
export const ROOT_FILES = new Set(['index.html','offline.html','manifest.webmanifest','style.css','app.js']);
const extensionTypes = {
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.gif':'image/gif','.svg':'image/svg+xml',
  '.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.otf':'font/otf','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav',
  '.mp4':'video/mp4','.webm':'video/webm','.wasm':'application/wasm'
};
export function mimeType(file) { return extensionTypes[file.slice(file.lastIndexOf('.')).toLowerCase()] || null; }
export function safePublicPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || /[\\?#%\x00-\x1f]/.test(value)) return false;
  const parts = value.slice(1).split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || p.startsWith('.'))) return false;
  return (ROOT_FILES.has(value.slice(1)) || PUBLIC_ROOTS.has(parts[0])) && Boolean(mimeType(value));
}
export function validateManifest(input) {
  if (!input || input.schema !== 1 || !/^[a-f0-9]{16,64}$/.test(input.releaseId || '') || input.origin !== GAME_ORIGIN)
    throw new Error('게임 업데이트 정보가 올바르지 않습니다.');
  if (!Array.isArray(input.files) || input.files.length < 1 || input.files.length > 25000) throw new Error('게임 파일 목록이 올바르지 않습니다.');
  const seen = new Set();
  const files = input.files.map(file => {
    if (!safePublicPath(file.path) || seen.has(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256 || '') ||
      !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > MAX_ASSET_BYTES || typeof file.essential !== 'boolean')
      throw new Error('검증할 수 없는 게임 파일이 있습니다.');
    seen.add(file.path);
    return Object.freeze({path:file.path,sha256:file.sha256,bytes:file.bytes,essential:file.essential,type:mimeType(file.path)});
  });
  if (!files.some(f => f.path === '/index.html' && f.essential)) throw new Error('게임 시작 파일이 없습니다.');
  const minimum = String(input.minimumClientVersion || '0.1.0');
  if (!/^\d+\.\d+\.\d+$/.test(minimum)) throw new Error('클라이언트 버전 정보가 올바르지 않습니다.');
  return Object.freeze({schema:1,releaseId:input.releaseId,origin:GAME_ORIGIN,minimumClientVersion:minimum,files:Object.freeze(files)});
}
export function versionLess(a,b) {
  const x=a.split('.').map(Number),y=b.split('.').map(Number);
  for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]<y[i];}return false;
}
export function manifestEntry(manifest,url,method='GET') {
  const u=new URL(url);
  if (!['GET','HEAD'].includes(method) || u.origin!==GAME_ORIGIN) return null;
  let pathname;try{pathname=decodeURIComponent(u.pathname);}catch{return null;}
  if (pathname==='/') pathname='/index.html';
  if (pathname.endsWith('/')) pathname+='index.html';
  if (!safePublicPath(pathname)) return null;
  return manifest.files.find(f=>f.path===pathname) || null;
}
export function allowedNavigation(url) {
  try {const u=new URL(url);return u.protocol==='https:' && [new URL(GAME_ORIGIN).hostname,'playdk.kr','www.playdk.kr'].includes(u.hostname) && !u.username && !u.password;}catch{return false;}
}
