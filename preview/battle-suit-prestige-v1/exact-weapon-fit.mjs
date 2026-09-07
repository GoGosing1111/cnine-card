import sharp from 'sharp';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const fits={
  3:{id:'sks',body:'helios-sks-long-fit-proxy-v6.png',weapon:'sovereign-sks-v1.png',width:840,rotation:6,flop:true,
    grip:[264,266],support:[650,180],muzzle:[1005,109],bore:[533,158]},
  4:{id:'gilded-ar',body:'helios-gilded-ar-long-fit-proxy-v7.png',weapon:'gilded-dragon-ar-v1.png',width:900,rotation:0,flop:false,
    grip:[286,228],support:[632,157],muzzle:[1021,109],bore:[600,109]},
  5:{id:'gilded-antimateriel',body:'helios-gilded-antimateriel-long-fit-proxy-v6.png',weapon:'gilded-dragon-antimateriel-v1.png',width:980,rotation:0,flop:false,
    grip:[231,220],support:[620,171],muzzle:[1015,129],bore:[550,129]}
};
export async function transformExactWeapon(spec){
  const source=path.join(root,'assets/ui/project-v/account-battle-suits/weapons',spec.weapon);
  let pipeline=sharp(source);if(spec.flop)pipeline=pipeline.flop();
  const scaled=await pipeline.resize({width:spec.width,kernel:'lanczos3'}).png().toBuffer();
  const meta=await sharp(scaled).metadata(),ratio=spec.width/1024;
  const buffer=spec.rotation?await sharp(scaled).rotate(spec.rotation,{background:'#00000000'}).png().toBuffer():scaled;
  const final=await sharp(buffer).metadata(),r=spec.rotation*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
  const relative=([x,y])=>({x:final.width/2+(x*ratio-meta.width/2)*c-(y*ratio-meta.height/2)*s,y:final.height/2+(x*ratio-meta.width/2)*s+(y*ratio-meta.height/2)*c});
  const grip=relative(spec.grip),left=Math.round(468-grip.x),top=Math.round(428-grip.y);
  const point=xy=>{const p=relative(xy);return {x:p.x+left,y:p.y+top};};
  return {buffer,point,width:final.width,height:final.height,placement:{width:spec.width,left,top,flop:spec.flop,rotationDegrees:spec.rotation}};
}
