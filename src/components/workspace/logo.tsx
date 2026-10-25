/** A page with a highlighted line: the app's mark. */
export function Logo({ size = 1 }: { size?: number }) {
  return (
    <span aria-hidden="true" className="relative block shrink-0 rounded-[3px] border-[1.5px] border-ink bg-white" style={{ width: 22 * size, height: 28 * size }}>
      <span className="absolute h-0.5 bg-ink" style={{ left: 4 * size, right: 4 * size, top: 5 * size }} />
      <span className="absolute bg-hl" style={{ left: 2 * size, right: 2 * size, top: 10 * size, height: 7 * size }} />
      <span className="absolute h-0.5 bg-ink" style={{ left: 4 * size, right: 8 * size, top: 20 * size }} />
    </span>
  );
}
