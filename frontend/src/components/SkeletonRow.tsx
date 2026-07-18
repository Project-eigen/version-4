interface SkeletonRowProps {
  /** round avatar vs rect thumb */
  avatar?: boolean
  count?: number
}

/** Structural loading row — Cabinet / Family parity */
export default function SkeletonRow({ avatar = false, count = 3 }: SkeletonRowProps) {
  return (
    <div className="skeleton-list" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, n) => (
        <div key={n} className="skeleton-card skeleton-card-spaced">
          <div
            className="skeleton-thumb"
            style={avatar ? { borderRadius: '50%', width: 48, height: 48 } : undefined}
          />
          <div className="skeleton-lines">
            <div className="skeleton-line" style={{ width: '55%' }} />
            <div className="skeleton-line skeleton-line-sm" style={{ width: '40%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}
