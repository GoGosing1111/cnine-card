// Wallets use signed 64-bit database integers. Read balances with CAST(coin AS
// TEXT), do arithmetic as BigInt, and serialize large values as decimal strings.
// A Number above MAX_SAFE_INTEGER has already lost information: never accept it
// as an authoritative balance. Numeric display fields may remain approximate.
export const MAX_COIN_INTEGER = 9223372036854775807n;
export const MAX_COIN_SQL = MAX_COIN_INTEGER.toString();
export function coinInteger(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('Invalid exact coin balance');
  if (!['string','number','bigint'].includes(typeof value) || !/^\d+$/.test(String(value))) throw new Error('Invalid exact coin balance');
  const result = BigInt(value);
  if (result < 0n || result > MAX_COIN_INTEGER) throw new Error('Coin balance out of range');
  return result;
}
export function coinValue(value) {
  const result = coinInteger(value);
  return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : result.toString();
}
export function addCoins(balance, delta) {
  if (typeof delta === 'number' && !Number.isSafeInteger(delta)) throw new Error('Invalid coin change');
  if (!['string','number','bigint'].includes(typeof delta) || !/^-?\d+$/.test(String(delta))) throw new Error('Invalid coin change');
  return coinValue(coinInteger(balance) + BigInt(delta));
}
export const coinCreditLimit = amount => (MAX_COIN_INTEGER - coinInteger(amount)).toString();
