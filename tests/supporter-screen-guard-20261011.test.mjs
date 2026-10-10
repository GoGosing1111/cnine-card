import test from 'node:test';
import assert from 'node:assert/strict';
import {protectedScreenShortcut} from '../js/supporter-screen-guard-v1.mjs';

test('browser-delivered screenshot shortcuts cover Windows, Mac and PrintScreen variants',()=>{
  for(const event of [{key:'PrintScreen'},{key:'Snapshot'},{code:'PrintScreen',altKey:true},{key:'s',metaKey:true,shiftKey:true},{key:'S',code:'KeyS',metaKey:true,shiftKey:true},...['3','4','5'].map(key=>({key,metaKey:true,shiftKey:true})),{key:'#',code:'Digit3',metaKey:true,shiftKey:true}])assert.equal(protectedScreenShortcut(event),'capture',JSON.stringify(event));
});
test('print/save shortcuts work with either platform modifier and non-Latin keyboard layouts',()=>{
  for(const modifier of ['ctrlKey','metaKey'])for(const [key,code,expected] of [['p','KeyP','print'],['s','KeyS','save']]){
    assert.equal(protectedScreenShortcut({key,[modifier]:true}),expected);
    assert.equal(protectedScreenShortcut({key:'ㅔ',code,[modifier]:true}),expected);
  }
});
test('normal calendar, button, search and accessibility keyboard navigation stays available',()=>{
  for(const event of [{key:'Enter'},{key:' '},{key:'Escape'},{key:'Tab'},{key:'Tab',shiftKey:true},{key:'ArrowRight'},{key:'ArrowDown'},{key:'PageDown'},{key:'Home'},{key:'End'},{key:'p'},{key:'s'},{key:'3',shiftKey:true},{key:'f',ctrlKey:true},{key:'+',ctrlKey:true}])assert.equal(protectedScreenShortcut(event),null,JSON.stringify(event));
});
