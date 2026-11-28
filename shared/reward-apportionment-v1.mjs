// Largest remainders receive the leftover units. Ties keep the displayed order.
export function apportionUnits(rows, total) {
  const sum = rows.reduce((n, row) => n + BigInt(row.units), 0n);
  if (!sum) return rows.map(row => ({...row, units: 0}));
  const ranked = rows.map((row, index) => {
    const exact = BigInt(row.units) * BigInt(total);
    return {index, remainder: exact % sum, units: Number(exact / sum)};
  });
  const left = total - ranked.reduce((n, row) => n + row.units, 0);
  const order = [...ranked].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const row of order.slice(0, left)) row.units++;
  return rows.map((row, i) => ({...row, units: ranked[i].units}));
}
