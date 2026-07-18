/**
 * Brand logo — Imagine mark for product surfaces.
 * - mark: app icon (header, small UI)
 * - wordmark: full logo with name (auth / marketing)
 * - circle: circular badge variant
 */

type BrandVariant = 'mark' | 'wordmark' | 'circle'

interface BrandLogoProps {
  variant?: BrandVariant
  className?: string
  /** Accessible name when used as decorative vs standalone */
  alt?: string
  size?: number
}

const SRC: Record<BrandVariant, string> = {
  mark: '/brand/logo-mark-square.png',
  wordmark: '/brand/logo-wordmark.png',
  circle: '/brand/logo-mark-circle.png',
}

export default function BrandLogo({
  variant = 'mark',
  className = '',
  alt = 'DawaiSathi',
  size,
}: BrandLogoProps) {
  const style =
    size != null
      ? variant === 'wordmark'
        ? { height: size, width: 'auto' }
        : { width: size, height: size }
      : undefined

  return (
    <img
      src={SRC[variant]}
      alt={alt}
      className={`brand-logo brand-logo-${variant} ${className}`.trim()}
      style={style}
      width={variant === 'wordmark' ? undefined : size}
      height={size}
      decoding="async"
      draggable={false}
    />
  )
}
