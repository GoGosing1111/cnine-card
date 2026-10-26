import {mountPetEquipment} from '/onestore/js/pet-equipment-window-v1.mjs?v=20261014-reward1';
mountPetEquipment(document.getElementById('pet-codex'),{codex:true});
for(const [src,attributes] of [
 ['/onestore/js/soopketmon-v21-exact-shell-adapter.js?v=20261009-pet-codex',{enabled:'false'}],
 ['/onestore/js/adventure-lobby-v2107.js?favorites=20261013-v1&v=20261012-support-hidden1',{}],
 ['/onestore/js/adventure-navigation-standalone.js?v=2108-shared-navigation',{route:'petDex'}]
])await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;Object.assign(script.dataset,attributes);script.onload=resolve;script.onerror=reject;document.head.append(script);});
