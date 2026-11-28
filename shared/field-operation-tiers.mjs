// PvE deck benchmarks are the lowest observed power with at least six wins in eight runs.
export const operationTiers = [
  {"id":"intro","name":"입문","yard":850,"escort":850,"hit":4,"cargo":4,"actions":155,"clock":3.4,"scrap":4,"frame":1,"coin":300000000,"masterStars":3000,"observed":{"yard":4620,"escort":4620}},
  {"id":"normal","name":"일반","yard":16000,"escort":16000,"hit":5,"cargo":6,"actions":145,"clock":3.2,"scrap":9,"frame":1,"coin":3000000000,"masterStars":30000,"observed":{"yard":35700,"escort":35700}},
  {"id":"elite","name":"정예","yard":145000,"escort":115000,"hit":7,"cargo":9,"actions":115,"clock":3,"scrap":16,"frame":2,"coin":30000000000,"masterStars":300000,"observed":{"yard":111021,"escort":111021}},
  {"id":"hero","name":"영웅","yard":40000000,"escort":16000000,"hit":9,"cargo":12,"actions":85,"clock":2.6,"scrap":26,"frame":3,"coin":300000000000,"masterStars":3000000,"observed":{"yard":4858765,"escort":4858765}},
  {"id":"legend","name":"전설","yard":1200000000000,"escort":500000000000,"hit":10,"cargo":14,"actions":58,"clock":1.8,"scrap":33,"frame":3,"coin":3000000000000,"masterStars":30000000,"observed":{"yard":13849125,"escort":41945725}},
  {"id":"extreme","name":"극한","yard":100000000000000,"escort":5000000000000,"hit":10,"cargo":15,"actions":23,"clock":0.7,"scrap":40,"frame":4,"coin":12000000000000,"masterStars":120000000,"observed":{"yard":41945725,"escort":73277175}},
  {"id":"challenger","name":"챌린저","yard":220000000000000,"escort":145000000000000,"hit":13,"cargo":19,"actions":17,"clock":0.58,"scrap":60,"frame":6,"coin":30000000000000,"masterStars":300000000,"observed":{"yard":73277175,"escort":73277175}}
];

export function fieldOperationEntry(mode) {
  return operationTiers.map(({id,name,coin,masterStars,observed}) => ({id,name,coin,masterStars,observedPower:observed[mode]}));
}
