import {Container, Sprite} from 'pixi.js';

// One battle timeline drives both the painted exposures and the separately baked light.
// Ground positions are the server's recipients after preceding movement finishes.
const staging = {
  RAHDEN_SEAL:     {width:212, anchorY:.88, lightY:-59, lightWidth:200, nativeContact:32},
  RAHDEN_CURSE:    {width:224, anchorY:.91, lightY:-44, lightWidth:201, nativeContact:35},
  RAHDEN_ULTIMATE: {width:302, anchorY:.91, lightY:-7,  lightWidth:285, nativeContact:32},
  VELSIR_CURSE:    {width:450, anchorY:.85, lightY:-13, lightWidth:180, nativeContact:32, field:true},
  VELSIR_SEAL:     {width:226, anchorY:.86, lightY:-73, lightWidth:232, nativeContact:41},
  VELSIR_ULTIMATE: {width:464, anchorY:.90, lightY:-8,  lightWidth:246, nativeContact:38, field:true}
};
const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
const unit = v => clamp(v,0,1);
const smooth = v => {const u=unit(v);return u*u*(3-2*u);};
const mix = (a,b,t) => a+(b-a)*t;

function makeSprite(texture, parent, anchorY) {
  const sprite = new Sprite(texture);
  sprite.anchor.set(.5,anchorY);
  sprite.eventMode = 'none';
  parent.addChild(sprite);
  return sprite;
}

export class KnightSkillFX {
  constructor(skill, frames, points, {viewport, origin, reducedMotion=false}) {
    this.skill = skill;
    this.frames = frames;
    this.points = points;
    this.viewport = viewport;
    this.direction = staging[skill.code];
    this.reducedMotion = reducedMotion;
    this.display = new Container({label:skill.code, eventMode:'none'});
    this.cursor = {time:0};
    this.currentFrame = 0;
    const xs = points.map(p=>p.x), ys = points.map(p=>p.y);
    this.left = Math.min(...xs);
    this.right = Math.max(...xs);
    this.center = {x:(this.left+this.right)/2, y:(Math.min(...ys)+Math.max(...ys))/2};
    this.origin = {x:origin?.x??viewport.width*.8,y:origin?.y??this.center.y};
    this.width = this.direction.field
      ? clamp(this.right-this.left+172, this.direction.width*.72, this.direction.width*1.21)
      : this.direction.width;
    // The hero wave/comet stays in proportion on a tall board. Leave a painted wash
    // on each occupied station so the upper and lower ranks read the same impact.
    this.wakes = this.direction.field ? points.map(point=>{
      const sprite = makeSprite(frames.art[10],this.display,.91);
      return {sprite,point};
    }) : [];
    const subjects = this.direction.field ? [this.center] : points;
    this.subjects = subjects.map(point=>{
      const group = new Container({eventMode:'none'});
      this.display.addChild(group);
      const ink = makeSprite(frames.art[0],group,this.direction.anchorY);
      const next = makeSprite(frames.art[1],group,this.direction.anchorY);
      return {group,ink,next,point};
    });
    this.contacts = points.map(point=>{
      const sprite = makeSprite(frames.light[0],this.display,.5);
      sprite.blendMode = 'add';
      sprite.position.set(point.x,point.y+this.direction.lightY);
      sprite.scale.set(this.direction.lightWidth/frames.light[0].width);
      return sprite;
    });
    this.render(0);
  }

  pose(subject, n) {
    const {group,point} = subject, {code,collisionFrame} = this.skill;
    const approach = smooth(n/collisionFrame), recoil = smooth((n-collisionFrame)/(11-collisionFrame));
    const motion = this.reducedMotion ? .16 : 1;
    let dx=0,dy=0,rotation=0,scale=1;
    switch (code) {
      case 'RAHDEN_SEAL':
        dy = 12*(1-approach);
        scale = .88+.12*approach;
        break;
      case 'RAHDEN_CURSE':
        dy = 10*(1-approach)-7*recoil;
        scale = .81+.19*approach;
        break;
      case 'RAHDEN_ULTIMATE': {
        const drop = smooth((n-3.6)/(collisionFrame-3.6));
        dx = 32*(1-drop);
        dy = -105*(1-drop);
        rotation = -.12*(1-drop);
        break;
      }
      case 'VELSIR_CURSE':
        dx = mix((this.right-this.left)*.5+60,0,approach)-((this.right-this.left)*.38+37)*recoil;
        dy = 25-12*approach;
        scale = .82+.18*approach;
        break;
      case 'VELSIR_SEAL':
        rotation = -.40*(1-approach)+.10*recoil;
        dy = -12*Math.sin(Math.PI*approach);
        scale = .84+.16*approach;
        break;
      case 'VELSIR_ULTIMATE': {
        const flight = smooth((n-2.3)/(collisionFrame-2.3));
        dx = (this.origin.x-point.x)*.73*(1-flight);
        dy = -Math.min(132,point.y*.35)*(1-flight);
        scale = .68+.32*flight;
        break;
      }
    }
    const size = this.width*(1+(scale-1)*motion);
    group.position.set(point.x+dx*motion,Math.max(20,point.y+dy*motion));
    group.rotation = rotation*motion;
    group.scale.set(size/this.frames.art[0].width);
  }

  render(time) {
    if (this.released) return;
    const {impactAt,duration,collisionFrame} = this.skill;
    const lead = time<=impactAt;
    const phase = lead ? unit(time/impactAt) : unit((time-impactAt)/(duration-impactAt-.21));
    const n = lead ? collisionFrame*phase : mix(collisionFrame,11,phase);
    const nativeTime = lead ? mix(1,this.direction.nativeContact,phase) : mix(this.direction.nativeContact,63,phase);
    this.currentFrame = Math.min(11,Math.floor(n+1e-6));
    this.display.alpha = smooth(time/.12)*smooth((duration-time)/.24);
    this.subjects.forEach((subject,i)=>{
      // The fore/after-images open slightly apart but all recipients meet the same impact frame.
      const offset = this.reducedMotion ? 0 : .19*i*Math.sin(Math.PI*phase);
      const exposure = clamp(n-offset,0,11), index = Math.floor(exposure+1e-7);
      const blend = smooth((exposure-index-.45)/.55);
      subject.ink.texture = this.frames.art[index];
      subject.next.texture = this.frames.art[Math.min(11,index+1)];
      subject.ink.alpha = 1-blend;
      subject.next.alpha = blend;
      subject.next.visible = blend>.002;
      this.pose(subject,exposure);
    });
    if (this.wakes.length) {
      const wave = this.skill.kind==='curse';
      const age = time-impactAt;
      const decay = wave ? .84 : .94;
      const strength = smooth((age+.13)/.13)*(1-smooth(age/decay));
      const drift = unit((age+.13)/(decay+.13));
      this.wakes.forEach(({sprite,point},i)=>{
        sprite.visible = strength>.005;
        if (!sprite.visible) return;
        const trail = wave ? 9 : 10;
        const index = Math.min(11,trail+Math.floor(drift*(12-trail)));
        sprite.texture = this.frames.art[index];
        sprite.position.set(point.x-(wave?15:0)*drift*(this.reducedMotion ? .16 : 1),point.y+3);
        const width = (wave?158:176)*(.9+.13*drift+(i%2)*.03);
        sprite.scale.set(width/sprite.texture.width);
        sprite.alpha = strength*(this.reducedMotion ? .58 : .94);
      });
    }
    const lightFrame = Math.round(unit((nativeTime-1)/62)*23);
    const light = this.frames.light[lightFrame];
    for (const sprite of this.contacts) {
      sprite.texture = light;
      sprite.alpha = this.reducedMotion ? .42 : .92;
    }
  }

  play(timeline, impact) {
    timeline.to(this.cursor,{time:this.skill.duration,duration:this.skill.duration,ease:'none',
      onUpdate:()=>this.render(this.cursor.time)},0);
    timeline.call(impact,[],this.skill.impactAt);
  }

  release() {
    if (this.released) return;
    this.released = true;
    this.display.removeFromParent();
    this.display.destroy({children:true});
    this.subjects.length = 0;
    this.contacts.length = 0;
    this.wakes.length = 0;
  }
}
