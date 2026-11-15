// Levels 4 and 5 retain their existing 25 seats.
export const CLAN_HIDEOUT_CAPACITY=Object.freeze([8,10,15,25,25]);
export const clanHideoutCapacity=stage=>CLAN_HIDEOUT_CAPACITY[Math.max(1,Math.min(5,Math.trunc(Number(stage)||1)))-1];
export const clanCapacityDescription='아지트 1레벨 8명 · 2레벨 10명 · 3레벨 15명 · 4·5레벨 25명 (원로 포함)';
