export const tempo = 1.25;
export const toSource = seconds => seconds * tempo;
export const toPlayback = seconds => Number((seconds / tempo).toFixed(9));
