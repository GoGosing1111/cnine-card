import {CLIENT_VERSION} from './policy.mjs';

// The Windows x64 client has a localized productName. Never let Electron add
// that display name to an HTTP header; keep browser/runtime versions intact.
export function windowsUserAgent({chrome,electron}) {
  for(const version of [CLIENT_VERSION,chrome,electron]) {
    if(typeof version!=='string'||!/^\d+(?:\.\d+){2,3}(?:-[A-Za-z0-9.-]+)?$/.test(version))
      throw new Error('Invalid User-Agent version');
  }
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Reversecall/${CLIENT_VERSION} Chrome/${chrome} Electron/${electron} Safari/537.36`;
}
