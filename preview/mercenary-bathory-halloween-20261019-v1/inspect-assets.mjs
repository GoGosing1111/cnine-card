import fs from 'node:fs/promises';
import sharp from 'sharp';
import {components} from './components.mjs';
const report={};
for(const name of await fs.readdir(new URL('./assets/body/',import.meta.url))){
 if(!name.endsWith('.png'))continue;
 const {data,info}=await sharp(new URL('./assets/body/'+name,import.meta.url).pathname.replace(/^\//,'')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 report[name]={width:info.width,height:info.height,components:components(data,info.width,info.height).map(c=>({pixels:c.ids.length,...c.box}))};
}
await fs.writeFile(new URL('./qa/source-components.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
