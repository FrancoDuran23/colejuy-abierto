// The mark: a "c" drawn as a route, with the bus as a dot at its end. Same shapes as src/app/icon.svg.
export default function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" data-illustration>
      <rect width="512" height="512" rx="112" fill="#1c1b18" />
      <path d="M333.1 164.1 A120 120 0 1 0 333.1 347.9" fill="none" stroke="#f3f0e8" strokeWidth="56" strokeLinecap="round" />
      <circle cx="333.1" cy="347.9" r="46" fill="#ef7d4f" stroke="#1c1b18" strokeWidth="14" />
    </svg>
  );
}
