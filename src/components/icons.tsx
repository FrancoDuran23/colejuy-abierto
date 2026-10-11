const base = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const CloseIcon = () => (
  <svg {...base}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const LocateIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="6.5" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
  </svg>
);

export const ShareIcon = () => (
  <svg {...base}>
    <path d="M12 15V3.5M7.5 8L12 3.5 16.5 8M5 12.5v6a2 2 0 002 2h10a2 2 0 002-2v-6" />
  </svg>
);

export const StarIcon = ({ filled }: { filled?: boolean }) => (
  <svg {...base} fill={filled ? "currentColor" : "none"}>
    <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" />
  </svg>
);

export const RampIcon = () => (
  <svg {...base} width={18} height={18}>
    <circle cx="10" cy="4.5" r="1.75" />
    <path d="M10 8v6h5l2.5 5M10 11h4.5M8 12.5a5 5 0 105.5 6.5" />
  </svg>
);

export const ChevronIcon = () => (
  <svg {...base}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const PlaneIcon = () => (
  <svg {...base} width={20} height={20}>
    <path d="M21 4L3 11l6.5 2.5M21 4l-3.5 15-8-5.5M21 4L9.5 13.5V19l3-3.2" />
  </svg>
);

export const DirectionsIcon = () => (
  <svg {...base}>
    <circle cx="5.5" cy="18.5" r="2" />
    <path d="M5.5 16.5V13a3.5 3.5 0 013.5-3.5h6a3 3 0 003-3V4.5" />
    <path d="M14.5 7.5L18 4l3.5 3.5" />
  </svg>
);

export const CopyIcon = () => (
  <svg {...base}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
    <path d="M15.5 8.5V6.5a2 2 0 00-2-2h-7a2 2 0 00-2 2v7a2 2 0 002 2h2" />
  </svg>
);

export const CheckIcon = () => (
  <svg {...base}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export const SearchIcon = () => (
  <svg {...base}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </svg>
);

export const InstagramIcon = () => (
  <svg {...base}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17" cy="7" r="0.8" fill="currentColor" />
  </svg>
);

/* The jujuy.dev mark: gradient window with three dots and a ">" "^_" prompt. */
export const JujuyDevIcon = () => (
  <svg viewBox="240 105 520 400" width="26" height="20" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="jjd-grad" x1="240" y1="105" x2="760" y2="505" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#FF6B58" />
        <stop offset="0.33" stopColor="#EC4586" />
        <stop offset="0.66" stopColor="#8B38E8" />
        <stop offset="1" stopColor="#2F6BF0" />
      </linearGradient>
    </defs>
    <rect x="240" y="105" width="520" height="400" rx="85" fill="url(#jjd-grad)" />
    <g fill="#fff">
      <circle cx="312" cy="166" r="15" />
      <circle cx="362" cy="166" r="15" />
      <circle cx="412" cy="166" r="15" />
    </g>
    <g fill="none" stroke="#fff" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round">
      <path d="M320 266l56 54-56 55" />
      <path d="M408 375l82-88 74 74h94" />
    </g>
  </svg>
);

export const XIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
  </svg>
);

export const DownloadIcon = () => (
  <svg {...base}>
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </svg>
);

export const MoonIcon = () => (
  <svg {...base}>
    <path d="M20.5 14.3A8.5 8.5 0 019.7 3.5 8.5 8.5 0 1020.5 14.3z" />
  </svg>
);

export const SunIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
