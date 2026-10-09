// A wait the person can see: a turning ring next to what is being fetched.
export default function Loading({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={className ? `loading ${className}` : "loading"} role="status">
      <span className="spinner" aria-hidden="true" />
      {children}
    </p>
  );
}
