import {gsap} from 'gsap';

export class CameraController{
  constructor(container,{width,height}){
    this.container=container;
    this.width=width;
    this.height=height;
    this.base={x:width/2,y:height/2,pivotX:width/2,pivotY:height/2,scale:1};
    this.reset(true);
  }

  setViewport(width,height){
    this.width=width;
    this.height=height;
    this.base.x=width/2;
    this.base.y=height/2;
    this.base.pivotX=width/2;
    this.base.pivotY=height/2;
    this.reset(true);
  }

  reset(immediate=false){
    const camera=this.container;
    if(immediate){
      gsap.killTweensOf([camera,camera.position,camera.pivot,camera.scale]);
      camera.position.set(this.base.x,this.base.y);
      camera.pivot.set(this.base.pivotX,this.base.pivotY);
      camera.scale.set(this.base.scale);
      camera.rotation=0;
      return;
    }
    return gsap.to(camera,{x:this.base.x,y:this.base.y,rotation:0,duration:.16,ease:'power2.out',overwrite:true});
  }

  focusAt(point,scale=1.075){
    this.container.pivot.set(point.x,point.y);
    this.container.position.set(point.x,point.y);
    this.container.scale.set(scale);
  }

  addZoom(timeline,{focus,scale=1.075,inDuration=.2,hold=.18,outDuration=.28,at=0}={}){
    const point=focus||{x:this.width/2,y:this.height/2};
    timeline.call(()=>{
      this.container.pivot.set(point.x,point.y);
      this.container.position.set(point.x,point.y);
    },[],at);
    timeline.to(this.container.scale,{x:scale,y:scale,duration:inDuration,ease:'power3.out'},at);
    timeline.to(this.container.scale,{x:1,y:1,duration:outDuration,ease:'power2.inOut'},at+inDuration+hold);
    timeline.call(()=>this.reset(true),[],at+inDuration+hold+outDuration+.01);
    return timeline;
  }

  /** Adds a 20px first impulse followed by exponential spring-decay. */
  addShake(timeline,{intensity=20,duration=.34,rotation=.008,at=0}={}){
    const steps=14;
    const slice=duration/steps;
    for(let index=0;index<steps;index+=1){
      const progress=index/(steps-1);
      const falloff=Math.exp(-4.2*progress)*(1-progress*.18);
      // Stable noise makes repeated playback deterministic while still
      // avoiding the mechanical left/right pattern of a CSS shake.
      const noiseX=Math.sin((index+1)*12.9898)*43758.5453;
      const noiseY=Math.sin((index+1)*78.233)*19341.177;
      const axisX=index===0?1:(noiseX-Math.floor(noiseX))*2-1;
      const axisY=index===0?-.45:(noiseY-Math.floor(noiseY))*2-1;
      timeline.to(this.container,{
        x:this.base.x+axisX*intensity*falloff,
        y:this.base.y+axisY*intensity*.68*falloff,
        rotation:axisX*rotation*falloff,
        duration:slice,
        ease:index<2?'power4.out':'sine.inOut'
      },at+slice*index);
    }
    timeline.to(this.container,{x:this.base.x,y:this.base.y,rotation:0,duration:.07,ease:'back.out(1.7)'},at+duration);
    return timeline;
  }

  destroy(){
    gsap.killTweensOf([this.container,this.container.position,this.container.pivot,this.container.scale]);
  }
}
