import {withMercenaryDeadline} from '../../shared/mercenary-loading-v1.mjs?v=20260925';

const retries=new Map();
// Own these textures locally. Detach abandoned images and bypass a stalled browser
// image request on retry, without changing Pixi's shared Assets cache.
export class FusionTextures {
  constructor(pixi,{ImageClass=Image,timeoutMs=8000}={}) {
    this.pixi=pixi;this.ImageClass=ImageClass;this.timeoutMs=timeoutMs;
    this.loads=new Map();this.textures=new Set();this.controller=new AbortController();
  }
  load(url) {
    if(this.controller.signal.aborted)return Promise.reject(new DOMException('화면을 닫았습니다.','AbortError'));
    if(this.loads.has(url))return this.loads.get(url);
    const image=new this.ImageClass(),attempt=retries.get(url)||0;image.decoding='async';
    const promise=withMercenaryDeadline(()=>new Promise((resolve,reject)=>{
      image.onload=()=>resolve(image);
      image.onerror=()=>reject(Error('이미지를 불러오지 못했습니다. 다시 시도해 주세요.'));
      image.src=url+(attempt?(url.includes('?')?'&':'?')+'fusionRetry='+attempt:'');
    }),{signal:this.controller.signal,timeoutMs:this.timeoutMs,message:'이미지 로딩이 지연됩니다. 다시 시도해 주세요.'})
      .then(()=>{
        if(this.controller.signal.aborted)throw new DOMException('화면을 닫았습니다.','AbortError');
        // The shipped UI vendor exposes Sprite.from, not the Texture constructor.
        const sprite=this.pixi.Sprite.from(image,true),texture=sprite.texture;
        sprite.destroy({texture:false,textureSource:false});this.textures.add(texture);return texture;
      })
      .catch(error=>{image.removeAttribute('src');retries.set(url,Math.max(attempt+1,retries.get(url)||0));this.loads.delete(url);throw error;})
      .finally(()=>{image.onload=null;image.onerror=null;});
    this.loads.set(url,promise);return promise;
  }
  destroy() {
    this.controller.abort();
    for(const texture of this.textures)texture.destroy(true);
    this.textures.clear();this.loads.clear();
  }
}
