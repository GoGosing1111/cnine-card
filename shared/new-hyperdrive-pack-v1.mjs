export const NEW_HYPERDRIVE_PACK = Object.freeze({
  id: 'new-hyperdrive',
  kind: 'new_hyperdrive',
  itemCode: 'NEW_HYPERDRIVE_PACK',
  name: '뉴 하이퍼드라이브팩',
  subtitle: 'NEW HYPERDRIVE',
  assetRoot: '/assets/ui/packs/new-hyperdrive-v1',
  apiPath: 'vehicle-draw/new-hyperdrive',
  unitPrice: 1000000,
  counts: Object.freeze([1, 10]),
  budgets: Object.freeze(['100000000000000', '1000000000000000'])
});

export function newHyperdriveBudgetQuote(unitPrice, budget) {
  const limit = BigInt(budget);
  const price = BigInt(unitPrice);
  const count = limit / price;
  const cost = count * price;
  return {count: Number(count), cost: Number(cost), unused: Number(limit - cost)};
}
