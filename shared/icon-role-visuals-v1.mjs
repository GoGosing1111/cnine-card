// Existing authored sixteen-frame sequences and approved SDs, without mutation.
// Muzzle coordinates are in the original 768 x 768 texture and follow its full transform.
import {iconDefinition} from './icon-roles-v1.mjs';

// Contact + return/release budget shared by authoritative timed encounters and
// V3 playback. Passive notices never become extra card actions.
export function iconEventReleaseSeconds(event){
 if(event.type==='ICON_SKILL'){
  const role=event.iconRole||iconDefinition(event.iconCode)?.role;
  const rows=(event.hits?.length||0)+(event.targets?.length||0);
  return .24+Math.max(0,rows-1)*.13+(['ASSASSIN','ASSAULT','DEFENSE'].includes(role)?.30:.12);
 }
 if(event.type==='ICON_STATUS')return ['HEAT','EXPIRED','CLEANSED','WARD_END'].includes(event.status)?0:.14;
 return ['ICON_DOT','ICON_GUARD'].includes(event.type)?.14:0;
}
export const ICON_ROLE_VISUALS=Object.freeze({
 'CN-1C000001':{id:'diim',skillDuration:1.28,hitDuration:.64},
 'CN-1C000002':{id:'hi-heeya',skillDuration:1.36,hitDuration:.60,muzzle:{x:.900,y:.540},axis:{x:.720,y:.500}},
 'CN-1C000003':{id:'namuneul-bongsoon',skillDuration:1.40,hitDuration:.68},
 'CN-1C000004':{id:'oh-joeun',skillDuration:1.48,hitDuration:.72},
 'CN-1C000005':{id:'orikkung',skillDuration:1.60,hitDuration:.72},
 'CN-1C000006':{id:'kangguyeol',skillDuration:1.52,hitDuration:.64},
 'CN-1C000007':{id:'ayoon',skillDuration:1.64,hitDuration:.70},
 'CN-1C000008':{id:'zeus-cheolgu',skillDuration:1.40,hitDuration:.68}
});
export function iconTexturePoint(actor,layer,point){
 const sprite=actor.fullBodySprite;if(!sprite?.texture||sprite.destroyed)return null;
 return layer.toLocal(sprite.toGlobal({x:(point.x-sprite.anchor.x)*sprite.texture.width,y:(point.y-sprite.anchor.y)*sprite.texture.height}));
}
export function iconMuzzle(actor,layer){
 const spec=ICON_ROLE_VISUALS[actor.cardId];if(!spec?.muzzle)return null;
 const origin=iconTexturePoint(actor,layer,spec.muzzle),back=iconTexturePoint(actor,layer,spec.axis);if(!origin||!back)return null;
 const d=Math.hypot(origin.x-back.x,origin.y-back.y)||1;return {origin,direction:{x:(origin.x-back.x)/d,y:(origin.y-back.y)/d},angle:Math.atan2(origin.y-back.y,origin.x-back.x)};
}
