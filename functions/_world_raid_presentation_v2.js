// Read from the room's immutable settings, never from the current global CMS.
// No DB roundtrip or simulation is required for the countdown UI.
export function worldRaidCombatRulesV2(cfg){
 return {bossAttackIntervalMs:Math.max(500,Number(cfg.bossAttackIntervalMs||5000)),bossAttackPower:Number(cfg.bossAttackPower||0),phase2StartHpPercent:Number(cfg.phase2StartHpPercent||70),phase2EndHpPercent:Number(cfg.phase2EndHpPercent||30),phase3EnrageMultiplier:cfg.phase3EnrageEnabled===false?1:Number(cfg.phase3EnrageMultiplier||1.75)};
}
