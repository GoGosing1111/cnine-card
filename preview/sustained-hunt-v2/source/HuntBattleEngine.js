import {Assets,Texture,Rectangle,Container,Sprite} from 'pixi.js';
import {gsap} from 'gsap';
import {BattleEngine as ScrapyardEngine} from '../../scrapyard-v3-v1/source/ScrapyardBattleEngine.js';
import {BattleCharacter,TEAM} from '../../project-v-v3/source/battle/BattleCharacter.js';
import {sampleSequence} from '../../project-v-mercenary-system-v1/source/MercenarySpriteSequence.js';
import {CAPACITY,crowdPosition} from '../hunt-rules.mjs';
import {GroundDrops} from './GroundDrops.js';
export class BattleEngine extends ScrapyardEngine{
  waitForAccountBattleUnitDamageQueueDrain(timeoutMs=2500){
    const run=this.accountBattleUnitFireRun,epoch=this.playbackEpoch;
    if(!run?.active)return Promise.resolve(true);
    let spent=0,last=performance.now();
    return new Promise(resolve=>{
      const poll=()=>{
        const now=performance.now();
        if(!this.huntPaused)spent+=now-last;
        last=now;
        if(epoch!==this.playbackEpoch||!run.active||this.accountBattleUnitFireRun!==run||
          (!this.accountBattleUnitDamageQueue?.length&&!this.accountBattleUnit?.fireTimeline))return resolve(true);
        if(spent>=Math.max(0,Number(timeoutMs)||0))return resolve(false);
        setTimeout(poll,40);
      };
      poll();
    });
  }
  waitForHuntResume(){
    if(!this.huntPaused)return Promise.resolve(true);
    return new Promise(resolve=>(this.huntResumeWaiters??=new Set()).add(resolve));
  }
  async playAccountBattleUnitShot(...args){
    const epoch=this.playbackEpoch;
    if(!await this.waitForHuntResume()||epoch!==this.playbackEpoch)return false;
    return super.playAccountBattleUnitShot(...args);
  }
  timeline(...args){
    const result=super.timeline(...args);
    if(this.huntPaused)for(const entry of this.simpleTimelines||[])entry.instance.pause();
    return result;
  }
  ensureEnemyCapacity(count){return super.ensureEnemyCapacity(Math.max(CAPACITY,count));}
  battlefieldAsset(){return '/preview/sustained-hunt-v2/assets/backgrounds/overgrown-forge-field-v2.png';}
  station(kind,index=0,team='ALLY'){
    if(kind==='cards'&&team==='ENEMY'){
      const p=crowdPosition(index),compact=Boolean(this.viewportFit)||this.mobile;
      return {x:(compact?590:865)+p.x*(compact?142:198)+(this.viewportFit?.offsetX||0),y:(compact?330:250)+p.y*(compact?214:128)+(this.viewportFit?.offsetY||0)};
    }
    return super.station(kind,index,team);
  }
  formationStations(){return super.formationStations().filter(s=>s.team!=='ENEMY');}
  layoutCharacterGrid(){
    const enemies=this.enemies;this.enemies=enemies.slice(0,5);
    try{super.layoutCharacterGrid();}finally{this.enemies=enemies;}
    const scale=this.viewportFit?.57:this.mobile?.52:.49;
    for(const [i,a] of enemies.entries()){
      const p=this.station('cards',i,'ENEMY');a.setFormation(p.x,p.y,scale);a.designScale=scale;a.perspectiveResolver=()=>scale;a.root.depthSortY=p.y;
      a.nameLabel.visible=!!a.isBoss;a.namePlate.visible=!!a.isBoss;a.hud.y=a.isBoss?-415:-270;a.hud.scale.set(.82);a.formationHudY=a.hud.y;
    }
  }
  async applyBattlePayload(payload){
    while(this.enemies.length<CAPACITY){
      const a=new BattleCharacter({id:'HUNT_SLOT_'+this.enemies.length,name:'몬스터',team:TEAM.ENEMY,texture:Texture.EMPTY,fullBodyTexture:Texture.EMPTY,fullBodyHeight:245,scale:.4,accent:0xe9aa65});
      a.root.alpha=0;a.battleActive=false;this.characters.push(a);this.enemies.push(a);this.combatLayer.addChild(a.root);
    }
    const atlas=await Assets.load('/preview/sustained-hunt-v2/assets/spawn/atlas-v1.webp');
    this.spawnFrames=Array.from({length:16},(_,i)=>new Texture({source:atlas.source,frame:new Rectangle(i%4*314,Math.floor(i/4)*314,314,314)}));
    const result=await super.applyBattlePayload(payload);this.layoutCharacterGrid();return result;
  }
  bindMonster(row){
    const a=super.bindMonster(row);a.useFullBodySprite(a.texture,row.battleHeight||(row.boss?395:245));
    a.fullBodySprite.scale.x=-Math.abs(a.fullBodySprite.scale.x);a.captureNeutralAvatarPose();
    a.nameLabel.visible=!!row.boss;a.namePlate.visible=!!row.boss;a.hud.y=row.boss?-415:-270;
    return a;
  }
  async arrival(actors){
    const epoch=this.playbackEpoch,clock={time:0};
    const rows=actors.map((a,i)=>{
      a.root.alpha=0;const root=new Container({label:'HUNT_MONSTER_ARRIVAL'});root.position.set(a.baseX,a.baseY);this.effectLayer.addChild(root);
      const s=new Sprite(this.spawnFrames[0]);s.anchor.set(.5,.8);s.width=190;s.height=190;root.addChild(s);
      return {a,id:a.id,root,s,delay:(i%4)*.045};
    });
    return this.timeline(tl=>tl.to(clock,{time:1.35,duration:1.35,ease:'none',onUpdate:()=>{
      for(const r of rows){const age=clock.time-r.delay-.2,v=sampleSequence(age,.2,.8);r.root.visible=!!v;
        if(v){r.s.texture=this.spawnFrames[v.index];r.s.alpha=v.alpha*.68;}
        if(r.a.id===r.id)r.a.root.alpha=Math.max(0,Math.min(1,age/.12));
      }
    }},0),()=>{for(const r of rows){r.root.destroy({children:true});if(epoch===this.playbackEpoch&&r.a.id===r.id&&r.a.hp>0)r.a.root.alpha=1;}},this.previewSpeed||1,{releaseAt:.48});
  }
  initialArrival(){return this.arrival(this.enemies.filter(a=>a.battleActive));}
  async spawnMonster(event){
    const epoch=this.playbackEpoch;await this.drainGeneration();
    if(epoch!==this.playbackEpoch||!this.visible)return false;
    const row=this.instances.get(event.targetId);if(!row||this.isAlive(this.enemies[row.slot]))throw Error('HUNT_SPAWN_SLOT_NOT_EMPTY');
    const a=this.bindMonster(row);
    if(row.boss)this.queueBanner(row.name,0xffc477,row.finalBoss?'최종 수호자 출현':'중간 보스 출현');
    return this.arrival([a]);
  }
  setHuntPaused(paused){
    this.huntPaused=!!paused;this.accountBattleUnitIsPaused=()=>this.huntPaused;
    for(const e of this.simpleTimelines||[])e.instance.paused(this.huntPaused);
    for(const e of this.skillTimeline?.active||[])e.timeline.paused(this.huntPaused);
    this.accountBattleUnit?.fireTimeline?.paused(this.huntPaused);
    this.skillChipPlayback?.syncPause();
    if(paused)this.audio?.stopAll?.();
    else{for(const resolve of this.huntResumeWaiters||[])resolve(true);this.huntResumeWaiters?.clear();}
  }
  attachGroundDrops(options){this.groundDrops?.destroy();this.groundDrops=new GroundDrops(this,options);return this.groundDrops;}
  cancelTimelines(){
    super.cancelTimelines();this.groundDrops?.clear();
    for(const resolve of this.huntResumeWaiters||[])resolve(false);this.huntResumeWaiters?.clear();
  }
  diagnostics(){return {...super.diagnostics(),hunt:{capacity:CAPACITY,alive:this.enemies.filter(a=>this.isAlive(a)).length,drops:this.groundDrops?.diagnostics()}};}
  destroy(){this.groundDrops?.destroy();this.groundDrops=null;super.destroy();this.spawnFrames?.forEach(f=>f.destroy(false));this.spawnFrames=null;}
}
