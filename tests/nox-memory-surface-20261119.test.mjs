import test from 'node:test';
import assert from 'node:assert/strict';
import {Container} from 'pixi.js';
import {NoxFloor} from '../raid/nox/floor.mjs';

test('a hidden or zero-scale battlefield defers floor projection and recovers all 30 hit targets',()=>{
  const previousObserver=globalThis.ResizeObserver,previousStyle=globalThis.getComputedStyle;
  let rect={width:0,height:0},disconnects=0;
  globalThis.ResizeObserver=class {observe(){}disconnect(){disconnects++;}};
  globalThis.getComputedStyle=()=>({getPropertyValue:()=> '120'});
  const root=new Container(),stage=new Container(),combatLayer=new Container();root.addChild(stage);stage.addChild(combatLayer);
  const engine={root,stage,combatLayer,app:{screen:{width:800,height:600},canvas:{closest:()=>({}),getBoundingClientRect:()=>rect}}};
  const floor=new NoxFloor(engine),state={status:'ACTIVE',stage:'MEMORY',challenge:{id:'memory-1',cue:null,cueStep:null,tiles:Array.from({length:30},(_,id)=>({id,kind:[2,13,28].includes(id)?'safe':'mine'}))},me:{hp:100,memoryTiles:[]}};
  try{
    assert.doesNotThrow(()=>floor.update(state));assert.equal(floor.layoutDirty,true);assert(floor.tiles.every(t=>t.points.length===0));
    rect={width:800,height:600};root.scale.set(0);
    assert.doesNotThrow(()=>floor.update(state));assert.equal(floor.layoutDirty,true);
    root.scale.set(1);floor.update(state);
    assert.equal(floor.tiles.length,30);assert(floor.tiles.every(t=>t.points.length===4&&t.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))));
    const target={children:Array.from({length:30},()=>({style:{}}))};floor.placeTargets(target);
    assert(target.children.every(t=>parseFloat(t.style.width)>0&&parseFloat(t.style.height)>0&&!/NaN|Infinity/.test(t.style.transform+t.style.clipPath)));
    assert.equal(floor.root.parent,combatLayer);
    for(const [i,tile] of [2,13,28].entries()){state.challenge.cue=tile;state.challenge.cueStep=i+1;floor.update(state);assert.equal(floor.tiles[tile].label.text,String(i+1));}
    floor.update({...state,stage:'COOP'});assert.equal(floor.root.visible,false);
  }finally{floor.destroy();root.destroy({children:true});globalThis.ResizeObserver=previousObserver;globalThis.getComputedStyle=previousStyle;}
  assert.equal(disconnects,1);
});
