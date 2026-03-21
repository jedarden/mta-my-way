/**
 * Skeleton - Animated shimmer placeholder components.
 *
 * Each skeleton matches the SHAPE of its corresponding content:
 * - FavoriteCardSkeleton: shaped like FavoriteCard (header + arrivals)
 * - ArrivalListSkeleton: two sections with arrival rows
 * - AlertListSkeleton: alert cards with severity headers
 * - CommuteCardSkeleton: commute header + route summary
 *
 * Uses CSS shimmer animation for visual feedback during loading.
 */

interface SkeletonBaseProps {
  /** Additional CSS classes */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

/**
 * Shimmer animation wrapper - creates the moving gradient effect
 */
function ShimmerBlock({ className = "", style }: SkeletonBaseProps) {
  return (
    <div
      className={`relative overflow-hidden rounded bg-surface dark:bg-dark-surface ${className}`}
      style={style}
    >
      {/* Shimmer overlay */}
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent dark:via-white/5" />
    </div>
  );
}

/**
 * FavoriteCardSkeleton - Matches the shape of a FavoriteCard
 *
 * Structure:
 *   - Header: station name, optional label, line bullets
 *   - Body: 3 arrival rows
 */
export function FavoriteCardSkeleton({ count = 1 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading favorite stations">
      {Array.from({ length: count }).map((_, i) => (
        <article
          key={i}
          className="bg-surface dark:bg-dark-surface rounded-lg overflow-hidden shadow-sm"
        >
          {/* Header section */}
          <div className="flex items-start gap-2 px-4 pt-4 pb-2">
            <div className="flex-1 min-w-0">
              {/* Station name */}
              <ShimmerBlock className="h-5 w-3/4 mb-1.5" />
              {/* Optional label */}
              <ShimmerBlock className="h-3.5 w-1/2 mb-2" />
              {/* Line bullets */}
              <div className="flex gap-1.5">
                <ShimmerBlock className="h-6 w-6 rounded-full" />
                <ShimmerBlock className="h-6 w-6 rounded-full" />
                <ShimmerBlock className="h-6 w-6 rounded-full" />
              </div>
            </div>
            {/* Edit button placeholder */}
            <ShimmerBlock className="h-10 w-10 rounded-lg shrink-0" />
          </div>

          {/* Arrivals section */}
          <div className="px-4 pb-4 space-y-1.5">
            <ShimmerBlock className="h-7 w-full" style={{ width: "85%" }} />
            <ShimmerBlock className="h-7 w-full" style={{ width: "70%" }} />
            <ShimmerBlock className="h-7 w-full" style={{ width: "90%" }} />
          </div>
        </article>
      ))}
    </div>
  );
}

/**
 * ArrivalListSkeleton - Matches the shape of an ArrivalList
 *
 * Structure:
 *   - Uptown section header + 3 arrival rows
 *   - Downtown section header + 2 arrival rows
 */
export function ArrivalListSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading arrivals">
      {/* Northbound section */}
      <section>
        <ShimmerBlock className="h-5 w-36 mb-3" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <ArrivalRowSkeleton key={i} />
          ))}
        </div>
      </section>

      {/* Southbound section */}
      <section>
        <ShimmerBlock className="h-5 w-40 mb-3" />
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <ArrivalRowSkeleton key={i} />
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * ArrivalRowSkeleton - Single arrival row placeholder
 */
export function ArrivalRowSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 bg-surface dark:bg-dark-surface rounded-lg">
      {/* Line bullet */}
      <ShimmerBlock className="h-8 w-8 rounded-full shrink-0" />
      {/* Destination */}
      <div className="flex-1 min-w-0">
        <ShimmerBlock className="h-4 w-32 mb-1" />
        <ShimmerBlock className="h-3 w-20" />
      </div>
      {/* Minutes away */}
      <ShimmerBlock className="h-7 w-12 shrink-0" />
    </div>
  );
}

/**
 * AlertListSkeleton - Matches the shape of an AlertList
 *
 * Structure:
 *   - Grouped by severity with section headers
 *   - Alert cards with headline and description
 */
export function AlertListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading alerts">
      {/* Severe section */}
      <section>
        <ShimmerBlock className="h-4 w-32 mb-2" />
        <div className="space-y-2">
          <AlertCardSkeleton />
        </div>
      </section>

      {/* Warning section */}
      <section>
        <ShimmerBlock className="h-4 w-16 mb-2" />
        <div className="space-y-2">
          {Array.from({ length: Math.min(count - 1, 2) }).map((_, i) => (
            <AlertCardSkeleton key={i} />
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * AlertCardSkeleton - Single alert card placeholder
 */
export function AlertCardSkeleton() {
  return (
    <div className="bg-surface dark:bg-dark-surface rounded-lg p-4">
      {/* Affected lines */}
      <div className="flex gap-1.5 mb-2">
        <ShimmerBlock className="h-5 w-5 rounded-full" />
        <ShimmerBlock className="h-5 w-5 rounded-full" />
      </div>
      {/* Headline */}
      <ShimmerBlock className="h-4 w-full mb-1.5" />
      <ShimmerBlock className="h-4 w-3/4 mb-2" />
      {/* Timestamp */}
      <ShimmerBlock className="h-3 w-24" />
    </div>
  );
}

/**
 * CommuteCardSkeleton - Matches the shape of a CommuteCard
 *
 * Structure:
 *   - Header: commute name + origin/destination
 *   - Body: route summary with line bullets and time
 */
export function CommuteCardSkeleton({ count = 1 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading commutes">
      {Array.from({ length: count }).map((_, i) => (
        <article
          key={i}
          className="bg-surface dark:bg-dark-surface rounded-lg overflow-hidden shadow-sm"
        >
          {/* Header section */}
          <div className="flex items-start gap-2 px-4 pt-4 pb-2">
            <div className="flex-1 min-w-0">
              {/* Commute name */}
              <ShimmerBlock className="h-5 w-24 mb-1.5" />
              {/* Origin → Destination */}
              <ShimmerBlock className="h-3.5 w-48" />
            </div>
            {/* Edit button placeholder */}
            <ShimmerBlock className="h-10 w-10 rounded-lg shrink-0" />
          </div>

          {/* Route summary section */}
          <div className="px-4 pb-3 space-y-2">
            {/* Line bullets + time */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <ShimmerBlock className="h-6 w-6 rounded-full" />
                <span className="text-11 text-text-secondary">→</span>
                <ShimmerBlock className="h-6 w-6 rounded-full" />
              </div>
              <ShimmerBlock className="h-7 w-12" />
            </div>
            {/* Transfer badge placeholder */}
            <ShimmerBlock className="h-5 w-28 rounded-full" />
          </div>
        </article>
      ))}
    </div>
  );
}

/**
 * CommuteListSkeleton - Multiple commute cards
 */
export function CommuteListSkeleton({ count = 2 }: { count?: number }) {
  return <CommuteCardSkeleton count={count} />;
}

/**
 * FavoritesListSkeleton - Multiple favorite cards (for HomeScreen loading state)
 */
export function FavoritesListSkeleton({ count = 3 }: { count?: number }) {
  return <FavoriteCardSkeleton count={count} />;
}

/**
 * Generic skeleton for simple loading states
 */
export function Skeleton({ className = "" }: SkeletonBaseProps) {
  return <ShimmerBlock className={className} />;
}

export default Skeleton;
