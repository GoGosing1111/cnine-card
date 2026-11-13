// Seconds on the native motion clock. The hold belongs to V3 playback and freezes
// the body, projectile and target response together. Distances are actor-local.
export const fighters = [
  {id:'hiheeya', name:'하이희야', weapon:'권총', skills:['ricochet','accelerator']},
  {id:'bongsoon', name:'나무늘봉순', weapon:'검·방패', skills:['crescent','aegis']},
  {id:'diim', name:'디임', weapon:'바주카', skills:['sunburst','singularity']},
  {id:'sudaeng', name:'수댕', weapon:'창', skills:['tidelance','maelstrom']},
  {id:'joeun', name:'조은', weapon:'소총 의무병', skills:['refraction','skyline']}
];

export const skills = {
  ricochet:    {name:'황금 도탄', release:.32, hit:.63, hold:.045, recover:.98, end:1.40, reach:0, stride:34, kick:9, tint:[255,191,79], shape:'volley'},
  accelerator: {name:'극광 가속탄', release:.68, hit:.84, hold:.085, recover:1.24, end:1.72, reach:0, stride:-16, kick:17, tint:[93,178,255], shape:'rail'},
  crescent:    {name:'청월 올려베기', release:.40, hit:.53, hold:.065, recover:.94, end:1.47, reach:170, stride:0, kick:16, tint:[93,153,255], shape:'slash'},
  aegis:       {name:'이지스 브레이크', release:.51, hit:.75, hold:.105, recover:1.19, end:1.76, reach:140, stride:0, kick:23, tint:[247,194,79], shape:'shield'},
  sunburst:    {name:'일점 작렬포', release:.46, hit:.74, hold:.085, recover:1.24, end:1.74, reach:0, stride:-20, kick:23, tint:[255,142,65], shape:'rocket'},
  singularity: {name:'특이점 박격포', release:.62, hit:1.13, hold:.12, recover:1.61, end:2.15, reach:0, stride:-26, kick:18, tint:[198,119,247], shape:'gravity'},
  tidelance:   {name:'쇄도하는 해류창', release:.37, hit:.57, hold:.06, recover:.96, end:1.50, reach:210, stride:0, kick:13, tint:[90,228,247], shape:'lance'},
  maelstrom:   {name:'용오름 낙창', release:.59, hit:.81, hold:.095, recover:1.39, end:1.95, reach:225, stride:0, kick:18, tint:[100,183,255], shape:'geyser'},
  refraction:  {name:'프리즘 관통사격', release:.50, hit:.65, hold:.055, recover:1.04, end:1.53, reach:0, stride:12, kick:11, tint:[97,246,187], shape:'optic'},
  skyline:     {name:'오로라 좌표포격', release:.61, hit:1.05, hold:.10, recover:1.48, end:2.05, reach:0, stride:28, kick:17, tint:[105,250,217], shape:'orbital'}
};

export const poseNames = ['guard','windup_a','strike_a','windup_b','strike_b','recover'];
