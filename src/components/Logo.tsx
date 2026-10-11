import Image from "next/image";

export default function Logo({ size = 32 }: { size?: number }) {
  return (
    <Image
      src="/icon-192.png"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className="product-mark"
      draggable={false}
      unoptimized
    />
  );
}
