import {fitCompactViewport, usesCompactViewport} from './ViewportLayout.mjs';
import {COOP_BOARDS, COOP_DUAL_BOARDS, DUO_BOARDS, DUO_DUAL_BOARDS} from './FormationLayout.mjs';

// The HUD reserves actor space, never canvas space. The same three Pixi
// background layers cover the full viewport, including behind the portraits.
export function layoutTacticalHud(engine) {
  const shell=engine.host?.closest('.has-tactical-hud');
  if(!shell||engine.gridMode!=='wide'||!engine.root)return false;
  const {width,height}=engine.app.screen,css=getComputedStyle(shell);
  const read=(key,fallback=0)=>parseFloat(css.getPropertyValue(key))||fallback;
  const left=read('--v3-hud-left'),right=read('--v3-hud-right');
  let top=read('--v3-hud-top',80),bottom=height>620?110:12;
  const dialogue=shell.querySelector('.jinmu-dialogue-rail');
  if(dialogue&&!engine.formationCoop)top=Math.max(top,dialogue.getBoundingClientRect().bottom-engine.host.getBoundingClientRect().top+8);
  const compact=usesCompactViewport(width)||engine.formationDuo;
  if(compact){
    const board=engine.formationCoop?(engine.formationMercenariesPerOwner===2?COOP_DUAL_BOARDS:COOP_BOARDS)[engine.mobile?'compact':'desktop']:engine.formationDuo?(engine.formationMercenariesPerOwner===2?DUO_DUAL_BOARDS:DUO_BOARDS)[engine.mobile?'compact':'desktop']:undefined;
    let objectiveHud=null;
    if(engine.objectiveData&&engine.objectiveHud?.visible){
      const b=engine.objectiveHud.getLocalBounds(),scale=Math.min(1,(width-left-right-16)/Math.max(1,b.width));
      objectiveHud={x:left+8,y:top+8,scale,height:b.height*scale+8};top+=objectiveHud.height;
    }
    engine.viewportFit=fitCompactViewport({width,height,top,bottom,left,right,board});
    engine.viewportFit.objectiveHud=objectiveHud;
    engine.scene=engine.viewportFit.scene;
    engine.root.scale.set(engine.viewportFit.scale);engine.root.position.set(0,0);
  }else{
    const scale=Math.min(Math.max(1,width-left-right)/engine.scene.width,Math.max(1,height-top-12)/engine.scene.height);
    engine.root.scale.set(scale);
    engine.root.position.set(left+(width-left-right-engine.scene.width*scale)/2,top+(height-top-12-engine.scene.height*scale)/2);
  }
  engine.accountBattleUnit?.setNameViewportScale?.(engine.root.scale.x);
  engine.camera.setViewport(engine.scene.width,engine.scene.height);
  engine.skillTimeline.width=engine.scene.width;engine.skillTimeline.height=engine.scene.height;
  engine.configureIsometricScene();engine.layoutCharacterGrid();engine.sortCombatDepth();engine.layoutObjectiveHud();
  const banner=engine.uiLayer?.banner;
  if(banner){
    const scale=engine.root.scale.x,availableWidth=Math.max(1,width-left-right),noticeScale=Math.min(1,(availableWidth-16)/320)/scale;
    banner.scale.set(noticeScale);
    banner.position.set((left+(availableWidth-320*noticeScale*scale)/2-engine.root.x)/scale,(top+8-engine.root.y)/scale);
    banner.baseY=banner.y;
  }
  const scale=engine.root.scale.x,coverWidth=width/scale+96,coverHeight=height/scale+96;
  const cx=(width/2-engine.root.x)/scale,cy=(height/2-engine.root.y)/scale;
  const x=cx-coverWidth/2,y=cy-coverHeight/2;
  engine.backdropBounds={x,y,width:coverWidth,height:coverHeight};
  for(const {sprite,mask,start,end} of engine.parallaxLayers||[]){
    sprite.scale.set(Math.max(coverWidth/sprite.texture.width,coverHeight/sprite.texture.height));sprite.position.set(cx,cy);
    mask.clear().rect(x-48,y+coverHeight*start-4,coverWidth+96,coverHeight*(end-start)+8).fill(0xffffff);
  }
  if(engine.backgroundShade){engine.backgroundShade.position.set(x,y);engine.backgroundShade.width=coverWidth;engine.backgroundShade.height=coverHeight;}
  if(engine.bottomShade){engine.bottomShade.position.set(x,cy+coverHeight/2-200);engine.bottomShade.width=coverWidth;engine.bottomShade.height=200;}
  const extraTop=String(engine.viewportFit?.objectiveHud?.height||0);
  if(engine.host.dataset.v3FormationExtraTop!==extraTop){engine.host.dataset.v3FormationExtraTop=extraTop;engine.host.dispatchEvent(new CustomEvent('v3-formation-resize',{bubbles:true}));}
  return true;
}
