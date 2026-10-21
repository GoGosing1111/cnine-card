import fs from 'node:fs';
const src='preview/project-v-v3/source/project-v-pixi-battle.src.js';let s=fs.readFileSync(src,'utf8').replace(/\r\n/g,'\n');s=s.replace("-tower-abyss-ui-20261021-v1'","-tower-abyss-ui-20261021-v1-seal-dragon-20261022-v1'");if(!s.includes(',prepareSealDragon,fxRuntime'))s=s.replace(',fxRuntime,mountEffectScene',',prepareSealDragon,fxRuntime,mountEffectScene');fs.writeFileSync(src,s);
const file='js/battle-v3-live.js';s=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');s=s.replace("-tower-abyss-ui-20261021-v1'","-tower-abyss-ui-20261021-v1-seal-dragon-20261022-v1'");
s=s.replace("    const monster = {\n      id: SEAL_ORB_ID,", "    const dragon=data.battlePhase==='BOSS'&&roleKey==='BOSS';\n    const monster = {\n      id: SEAL_ORB_ID,");
// Preserve the legacy crystal payload verbatim; only authoritative BOSS receipts
// choose the new art and shared-HP presentation.
const marker="    const win = String(data.result || '').toUpperCase() === 'WIN';\n    const steps";
if(!s.includes(marker))throw Error('Missing seal payload');
s=s.replace(marker,`    if(dragon){
      const id='SEAL_DRAGON_NERGAON';
      Object.assign(monster,{id,monsterId:id,cardId:'MONSTER:'+id,name:data.boss?.name||'봉인룡 네르가온',title:data.boss?.name||'봉인룡 네르가온',image:'/assets/ui/seal-battle/dragon-20261022/portrait.webp',image_url:'/assets/ui/seal-battle/dragon-20261022/portrait.webp',hp:Number(data.bossHpBefore),maxHp:Number(data.bossMaxHp),
        projectVMonsterArt:{scope:'BATTLE_ENGINE_ONLY',kind:'SEAL_DRAGON_SD',primaryUrl:'/assets/ui/seal-battle/dragon-20261022/portrait.webp',footAnchor:{x:.5,y:.98},scaleMultiplier:1.2,technicalPass:true}});
    }
    const win = String(data.result || '').toUpperCase() === 'WIN';
    const steps`);
s=s.replace('    let enemyHp = 100;\n    const timeline = [];\n    allies.forEach((card, index) => {\n      const damagePercent', '    let enemyHp = dragon?Number(data.bossHpBefore):100;\n    let distributed=0;\n    const timeline = [];\n    allies.forEach((card, index) => {\n      const damagePercent');
s=s.replace('      enemyHp = Math.max(win && index === allies.length - 1 ? 0 : win ? 3 : 26, enemyHp - damagePercent);',`      const share=dragon?(index===allies.length-1?Number(data.contribution)-distributed:Math.floor(Number(data.contribution)/Math.max(1,allies.length))):0;
      distributed+=share;
      enemyHp = dragon?Math.max(0,Number(data.bossHpBefore)-distributed):Math.max(win && index === allies.length - 1 ? 0 : win ? 3 : 26, enemyHp - damagePercent);`);
s=s.replace('damage: Math.max(1, Math.round(Number(data.totalBattleDamage || data.playerPower || 1000) * damagePercent / 100)),','damage: dragon?share:Math.max(1, Math.round(Number(data.totalBattleDamage || data.playerPower || 1000) * damagePercent / 100)),');
s=s.replace('        targetHpAfter: enemyHp,\n        critical: index', '        targetHpAfter: enemyHp,\n        ...(dragon?{targetMaxHp:monster.maxHp}:{}),\n        critical: index');
s=s.replace("label: '봉인 역류'","label: dragon?'봉인룡의 청염':'봉인 역류'");
s=s.replace("    if (win) timeline.push({ type: 'KO', targetId: monster.cardId });", "    if (dragon?data.bossDefeated:win) timeline.push({ type: 'KO', targetId: monster.cardId });");
s=s.replace('    prepareLoading,\n    createRenderer,','    prepareLoading,\n    prepareSealDragon: async()=>{await ensureCurrentBattleRuntime();return root.ProjectVPixiBattle.prepareSealDragon();},\n    createRenderer,');
fs.writeFileSync(file,s);
