export function PageSkeleton({
  hero,
  cards = 4,
}: {
  hero?: boolean;
  cards?: number;
}) {
  return (
    <div>
      {hero ? (
        <div className="skel-hero">
          <div className="shell space-y-3">
            <div className="skel h-11 w-full" />
            <div className="hero-stats">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skel h-24 w-full" />
              ))}
            </div>
          </div>
        </div>
      ) : null}
      <div className="shell page-stack space-y-4">
        {hero ? null : <div className="skel h-10 w-56" />}
        <div className="space-y-3">
          {Array.from({ length: cards }).map((_, i) => (
            <div key={i} className="skel h-20 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
