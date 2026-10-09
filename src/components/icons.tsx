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
