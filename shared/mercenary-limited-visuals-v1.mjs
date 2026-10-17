import {HALLOWEEN_VISUALS} from './mercenary-halloween-visual-v1.mjs';
import {LIMITED_BATTLE_VISUALS as approvedCatalog} from './mercenary-limited-visual-catalog-v1.mjs';
import {HARLEQUIN_VISUAL} from './mercenary-harlequin-visual-v1.mjs';
const catalog={...approvedCatalog,version:'20261017-halloween-ready-v1',characters:[...approvedCatalog.characters,HARLEQUIN_VISUAL,...HALLOWEEN_VISUALS]};

export {catalog as LIMITED_VISUALS};
export const limitedVisual=code=>catalog.characters.find(c=>c.code===code)||null;
export function limitedBattleArt(code){
 const c=limitedVisual(code);if(!c)return null;
 const scale=catalog.reference.bodyHeight/c.bodyHeight;
 return {code:c.code,name:c.name,sourceArt:c.source,battleSprite:c.sprite,battleSpriteSha256:c.spriteSha256,
  spriteUrl:c.sprite+'?v='+c.spriteSha256.slice(0,16),footAnchor:{x:c.feet.x/c.spriteWidth,y:c.feet.y/c.spriteHeight},
  fullBodyHeight:c.spriteHeight*scale,bodyHeight:catalog.reference.bodyHeight,originalTextureHeight:c.originalSprite.height*scale};
}
// Pixel registrations are transformed through the actual sprite, including the enemy mirror.
export function limitedEmission(actor,layer){
 const c=limitedVisual(actor.cardId);if(!c?.emission)return null;
 const s=actor.fullBodySprite;
 const point=p=>layer.toLocal({x:p.x-c.feet.x,y:p.y-c.feet.y},s);
 const emission=point(c.emission),back=point(c.axisBack),foot=point(c.feet),head=point({x:c.feet.x,y:c.headTop});
 const height=Math.hypot(foot.x-head.x,foot.y-head.y),length=Math.hypot(emission.x-back.x,emission.y-back.y);
 const direction={x:(emission.x-back.x)/length,y:(emission.y-back.y)/length};
 return {emission,direction,height,origin:{x:emission.x+direction.x*height*.018,y:emission.y+direction.y*height*.018},angle:Math.atan2(direction.y,direction.x)};
}
