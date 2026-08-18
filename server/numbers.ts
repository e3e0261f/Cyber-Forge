// server/numbers.ts

export function formatCompactNumber(nInput: bigint | number | string): string {
  let n: bigint;
  try {
    if (typeof nInput === 'bigint') {
      n = nInput;
    } else if (typeof nInput === 'number') {
      n = BigInt(Math.floor(nInput));
    } else {
      n = BigInt(nInput);
    }
  } catch {
    return '       0';
  }

  if (n < 0n) n = 0n;

  if (n <= 999_999n) {
    const s = n.toString();
    const formatted = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return formatted.padStart(8, ' ');
  }

  const numFloat = Number(n);

  if (n < 1_000_000_000n) {
    const val = (numFloat / 1_000_000).toFixed(2);
    return `${val}M`.padStart(8, ' ');
  }

  if (n < 1_000_000_000_000n) {
    const val = (numFloat / 1_000_000_000).toFixed(2);
    return `${val}G`.padStart(8, ' ');
  }

  if (n < 1_000_000_000_000_000n) {
    const val = (numFloat / 1_000_000_000_000).toFixed(2);
    return `${val}T`.padStart(8, ' ');
  }

  if (n < 1_000_000_000_000_000_000n) {
    const val = (numFloat / 1_000_000_000_000_000).toFixed(2);
    return `${val}P`.padStart(8, ' ');
  }

  if (n < 1_000_000_000_000_000_000_000n) {
    const val = (numFloat / 1_000_000_000_000_000_000).toFixed(2);
    return `${val}E`.padStart(8, ' ');
  }

  if (n < 1_000_000_000_000_000_000_000_000n) {
    const val = (numFloat / 1_000_000_000_000_000_000_000).toFixed(2);
    return `${val}Z`.padStart(8, ' ');
  }

  const val = (numFloat / 1_000_000_000_000_000_000_000_000).toFixed(2);
  return `${val}Y`.padStart(8, ' ');
}
