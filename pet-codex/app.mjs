import {mountPetEquipment} from '/js/pet-equipment-window-v1.mjs?v=20261014-reward1';
mountPetEquipment(document.getElementById('pet-codex'),{codex:true});
for(const [src,attributes] of [
 ['/js/soopketmon-v21-exact-shell-adapter.js?v=20261009-pet-codex',{enabled:'false'}],
 ['/js/adventure-lobby-v2107.js?favorites=20261013-v1&v=20261012-support-hidden1&tacticalNav=20261030-shell1&growthGuide=20261030-1',{}],
 ['/js/adventure-navigation-standalone.js?v=2108-shared-navigation',{route:'petDex'}]
])await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;Object.assign(script.dataset,attributes);script.onload=resolve;script.onerror=reject;document.head.append(script);});
