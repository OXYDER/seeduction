export default function Emblem({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="emblemGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f5d67a" />
          <stop offset="100%" stopColor="#c99a2e" />
        </linearGradient>
      </defs>
      <path
        fill="url(#emblemGold)"
        d="M50 4c4 10-2 22-8 28 6-2 12-8 14-16 4 8 2 18-6 26 8-2 14-10 16-18 6 10 2 24-10 32 4 14 2 24-6 32 8-2 14-8 16-16 2 10-2 20-16 26v10h-8V88c-14-6-18-16-16-26 2 8 8 14 16 16-8-8-10-18-6-32-12-8-16-22-10-32 2 8 8 16 16 18-8-8-10-18-6-26 2 8 8 14 14 16-6-6-12-18-8-28z"
      />
    </svg>
  );
}
