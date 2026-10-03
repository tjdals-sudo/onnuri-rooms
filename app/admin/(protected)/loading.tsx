export default function Loading() {
  return (
    <div className="space-y-3" aria-busy>
      <div className="skeleton h-8 w-48" />
      <div className="skeleton h-40" />
      <div className="skeleton h-64" />
    </div>
  );
}
