export const toCents = (rand: number) => Math.round(rand * 100);

/** R 1 234.50 — SA style with a space for thousands and a dot for cents. */
export function formatRand(cents: number, opts: { whole?: boolean } = {}): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const rands = Math.floor(abs / 100);
  const c = String(abs % 100).padStart(2, "0");
  const r = String(rands).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const s = opts.whole && c === "00" ? `R ${r}` : `R ${r}.${c}`;
  return neg ? `-${s}` : s;
}

/** Amount string for gateways: 120.00 */
export const gatewayAmount = (cents: number) => (cents / 100).toFixed(2);
