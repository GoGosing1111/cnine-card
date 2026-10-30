/* ImageGen originals: output/imagegen/tactical-ui-20261030/manifest.json. */
(function(global){
 'use strict';
 const ids='home dex cards mercenaryDex petDex upgrade evolution iconfusion magic battle deck hunt raid coop escort defense seal legion tower scrapyard masterStarMine pvp duo classicColosseum jokgakCity rank clan clanWar clanFaction coup territory equipment title garage avatar fusion vehicle alchemy gift attendance dailyquest messages mineral prediction auction inventory soopketland prison prisoncamp administration world favorites eye search mercenaryEquipment equipmentForge buy lootShop seasonPass grid settings fullscreen chicken goldenAxe'.split(' ');
 const aliases={menu:'grid',all:'grid',collection:'cards',growth:'equipmentForge',combat:'battle',swords:'pvp',forge:'equipmentForge',bag:'inventory',shield:'defense',book:'dex',pack:'buy',mail:'messages',user:'avatar',character:'equipment',workshop:'fusion',mercenaryHangar:'mercenaryEquipment',treasury:'lootShop',siege:'defense',idle:'battle'};
 const resolve=name=>ids.includes(name)?name:aliases[name]||'grid';
 const images=global.__TACTICAL_UI_IMAGES__||{};
 const html=(name,className='')=>'<img class="tactical-icon '+className+'" src="'+(images[resolve(name)]||'/assets/ui/tactical-20261030/'+resolve(name)+'.webp')+'" data-tactical-icon="'+resolve(name)+'" width="40" height="40" alt="" aria-hidden="true" draggable="false">';
 global.SoopTacticalIcons=Object.freeze({version:'20261030-v1',ids:Object.freeze(ids),aliases:Object.freeze(aliases),resolve,html});
})(globalThis);
