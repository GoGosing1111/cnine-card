export const JOKRO_DIALOGUE_LINES=Object.freeze(['칼끝이 닿기 전에, 승부는 끝났다.','흐름을 읽어라. 베이는 것은 한순간이다.','청룡이 지나간 자리엔 고요만 남는다.','검을 뽑는 순간, 물러설 길은 없다.','이 한 칼로, 하늘마저 가른다.']);
export const JINMU_DIALOGUE_LINES=Object.freeze([
 '고개를 들어라. 마지막으로 볼 하늘이다.',
 '천룡의 이름으로, 이 전장을 평정한다.',
 '내 검 앞에서 운명을 논하지 마라.',
 '용이 눈을 떴다. 이제 물러설 곳은 없다.',
 '천룡이여, 내려와 오만한 자들을 심판하라.'
]);
export const VALTER_DIALOGUE_LINES=Object.freeze([
 '무릎 꿇어라. 판결은 이미 내려졌다.',
 '내 검이 닿는 곳, 저항은 끝난다.',
 '붉은 맹세 아래, 마지막 적까지 집행한다.'
]);
export const HELIOS_DIALOGUE_LINES=Object.freeze([
 '눈을 떠라. 너희의 마지막 태양이다.',
 '어둠의 끝에서, 나의 검이 떠오른다.',
 '천 개의 태양이여, 이 전장에 강림하라.'
]);

// Existing approved portraits, cropped only by the dialogue's CSS viewport.
export const MERCENARY_DIALOGUE_PROFILES=Object.freeze({
 'V-979':Object.freeze({code:'V-979',theme:'jokro',name:'족로',skill:'청룡단천',lines:JOKRO_DIALOGUE_LINES,idleLine:JOKRO_DIALOGUE_LINES[0],portrait:'/preview/mercenary-jokro-iaido-20261017-v1/assets/source-art-preview.webp',position:'50% 14%',size:'500% auto'}),
 'V-989':Object.freeze({code:'V-989',theme:'jinmu',name:'천룡검황 진무',skill:'천룡강림',lines:JINMU_DIALOGUE_LINES,idleLine:JINMU_DIALOGUE_LINES[1],portrait:'/preview/mercenary-golden-dragon-battle-v1/assets/source-art-preview.webp',position:'57% 6%',size:'390% auto'}),
 'V-996':Object.freeze({code:'V-996',theme:'valter',name:'발테르',skill:'종결 집행',lines:VALTER_DIALOGUE_LINES,idleLine:VALTER_DIALOGUE_LINES[0],portrait:'/preview/mercenary-crimson-silver-knight-battle-v1/assets/source-art-preview.webp',position:'58% 1%',size:'390% auto'}),
 'V-999':Object.freeze({code:'V-999',theme:'helios',name:'헬리오스',skill:'천양붕락',lines:HELIOS_DIALOGUE_LINES,idleLine:HELIOS_DIALOGUE_LINES[0],portrait:'/assets/ui/packs/limited-v1/v-999-640.webp',position:'59% 5%',size:'410% auto'})
});
