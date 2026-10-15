import {mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import path from 'node:path';

const MIN=.5,MAX=2;
const bounded=value=>Math.max(MIN,Math.min(MAX,Math.round(value*10)/10));

// Only game windows attach here; the launcher keeps its fixed layout. The
// sandboxed wheel listener exposes no bridge to the remote page.
export class GameZoom {
  constructor(settingsPath){
    this.settingsPath=settingsPath;this.factor=1;this.contents=new Set();
    try{
      const saved=JSON.parse(readFileSync(settingsPath,'utf8'));
      if(saved.schema===1&&Number.isFinite(saved.zoomFactor))this.factor=bounded(saved.zoomFactor);
    }catch{}
  }
  change(action){
    if(!['in','out','reset'].includes(action))return;
    const next=action==='reset'?1:bounded(this.factor+(action==='in'?.1:-.1));
    if(next===this.factor)return;
    this.factor=next;
    for(const contents of this.contents)if(!contents.isDestroyed())contents.setZoomFactor(next);
    // The tiny preference is saved atomically before returning, so an immediate
    // game/application close also preserves the last chosen size.
    try{
      mkdirSync(path.dirname(this.settingsPath),{recursive:true});
      const temporary=this.settingsPath+'.tmp';
      writeFileSync(temporary,JSON.stringify({schema:1,zoomFactor:next})+'\n','utf8');
      renameSync(temporary,this.settingsPath);
    }catch(error){console.warn('Game display size could not be saved:',error.message);}
  }
  attach(contents){
    if(this.contents.has(contents))return;
    this.contents.add(contents);
    contents.on('did-finish-load',()=>contents.setZoomFactor(this.factor));
    contents.once('destroyed',()=>this.contents.delete(contents));
  }
}
