function secureUniform() {
  const words = new Uint32Array(128);
  let index = words.length;
  return () => {
    if (index === words.length) {
      crypto.getRandomValues(words);
      index = 0;
    }
    const high = words[index++] >>> 5;
    const low = words[index++] >>> 6;
    return (high * 67108864 + low) / 9007199254740992;
  };
}

function failuresBeforeSuccess(probability, random) {
  if (probability === 1) return 0;
  return Math.floor(Math.log1p(-random()) / Math.log1p(-probability));
}

function sampleSparse(trials, probability, random) {
  let successes = 0;
  while (trials > 0) {
    trials -= 1 + failuresBeforeSuccess(probability, random);
    if (trials >= 0) successes++;
  }
  return successes;
}

// Marsaglia & Tsang's gamma sampler for shape >= 1. doi:10.1145/358407.358414
function sampleGamma(shape, random) {
  const scale = shape - 1 / 3;
  const spread = 1 / Math.sqrt(9 * scale);
  while (true) {
    const normal = Math.sqrt(-2 * Math.log1p(-random())) * Math.cos(2 * Math.PI * random());
    const base = 1 + spread * normal;
    if (base <= 0) continue;
    const power = base ** 3;
    const change = power - 1;
    const uniform = random();
    if (uniform < 1 - 0.0331 * normal ** 4 ||
      Math.log(uniform) < 0.5 * normal ** 2 + scale * (Math.log1p(change) - change)) return scale * power;
  }
}

// Condition on a uniform order statistic near the probability threshold.
// Its beta distribution splits the trial count into a smaller binomial problem.
// Devroye, Non-Uniform Random Variate Generation, section X.4.6.
export function sampleHyperdriveBinomial(trials, probability, random) {
  let successes = 0;
  while (trials > 0 && probability > 0) {
    if (probability >= 1) return successes + trials;
    if (trials * probability < 30) return successes + sampleSparse(trials, probability, random);
    const failureProbability = 1 - probability;
    if (trials * failureProbability < 30) return successes + trials - sampleSparse(trials, failureProbability, random);

    const order = Math.floor((trials + 1) * probability);
    const left = sampleGamma(order, random);
    const right = sampleGamma(trials + 1 - order, random);
    const pivot = left / (left + right);
    if (pivot <= probability) {
      successes += order;
      trials -= order;
      probability = (probability - pivot) / (1 - pivot);
    } else {
      trials = order - 1;
      probability /= pivot;
    }
  }
  return successes;
}

export function sampleHyperdriveBulk(pool, count, ownedAvatarCodes, random = secureUniform()) {
  const vehicles = pool.filter(row => row.rewardType === 'VEHICLE');
  const avatars = pool.filter(row => row.rewardType === 'AVATAR' && !ownedAvatarCodes.has(row.code));
  const vehicleWeight = vehicles.reduce((sum, row) => sum + Number(row.draw_weight), 0);
  const draws = [];
  let avatarTrials = count;
  while (avatars.length && avatarTrials > 0) {
    const avatarWeight = avatars.reduce((sum, row) => sum + Number(row.draw_weight), 0);
    const gap = failuresBeforeSuccess(avatarWeight / (avatarWeight + vehicleWeight), random);
    avatarTrials -= gap + 1;
    if (avatarTrials < 0) break;
    let target = random() * avatarWeight;
    const index = avatars.findIndex(row => (target -= Number(row.draw_weight)) < 0);
    const [row] = avatars.splice(index, 1);
    draws.push({row, count: 1});
  }

  // Given the number of vehicle hits, the relative vehicle weights stay fixed
  // throughout the batch, even when a newly owned avatar leaves the pool.
  let remaining = count - draws.length;
  if (remaining && !vehicles.length) return null;
  const suffixWeights = Array(vehicles.length + 1).fill(0);
  for (let i = vehicles.length - 1; i >= 0; i--) suffixWeights[i] = Number(vehicles[i].draw_weight) + suffixWeights[i + 1];
  for (const [i, row] of vehicles.entries()) {
    if (!remaining) break;
    const hits = sampleHyperdriveBinomial(remaining, Number(row.draw_weight) / suffixWeights[i], random);
    if (hits) draws.push({row, count: hits});
    remaining -= hits;
  }
  return {draws, stars: sampleHyperdriveBinomial(count, 0.01, random)};
}
