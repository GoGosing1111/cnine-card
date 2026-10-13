import { profileImageUrl } from './streamer-lounge-model-v2036.js?v=2036';

// SOOP's /m/ thumbnails are commonly 100px. The full-size endpoint keeps animation.
export function portraitSourceUrl(value) {
  const src = profileImageUrl(value); if (!src || src.startsWith('/')) return src;
  const url = new URL(src);
  if (url.hostname === 'stimg.sooplive.com'
    && /^\/LOGO\/[a-zA-Z0-9]{2}\/([a-zA-Z0-9_]+)\/m\/\1\.webp$/.test(url.pathname)) {
    url.pathname = url.pathname.replace('/m/', '/');
    return url.href;
  }
  return src;
}

export function portraitSize(slot, naturalWidth, naturalHeight, density = 1) {
  return Math.max(1, Math.floor(Math.min(slot, naturalWidth / Math.max(1, density), naturalHeight / Math.max(1, density))));
}
