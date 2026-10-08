// Imported authored animation timings from eec0cfb8. These are visual beats only.
// Actual skills, damage and tiers use mercenary-ss-limited-v1.mjs.
export const LIMITED_DUO_VERSION='20261009-limited-duo-deployment-v1';
export const LIMITED_DUO=Object.freeze({
 'V-997':Object.freeze({id:'ayoon',name:'아윤',role:'VANGUARD',position:'FRONT',skillId:'MS-997',impacts:[.84,1.55,2.35],duration:3.3,basicImpact:.65,basicDuration:1.4,accent:'#f456bf'}),
 'V-998':Object.freeze({id:'heeya',name:'하이희야',role:'RANGED',position:'BACK',skillId:'MS-998',impacts:[.65,.83,1.01,1.19,1.45,1.73,2.2],duration:3.15,basicImpact:.58,basicDuration:1.2,accent:'#ed6354'})
});
export const limitedDuo=code=>Object.hasOwn(LIMITED_DUO,code)?LIMITED_DUO[code]:null;
