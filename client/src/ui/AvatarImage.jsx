import React, { useMemo, useState } from 'react'

const fallbackInitials = (value) => {
  if (!value) return '??'
  const trimmed = value.toString().trim()
  if (!trimmed) return '??'
  return trimmed.slice(0, 2).toUpperCase()
}

export default function AvatarImage({ user, size = 36, className = '', src, fallback }) {
  const [broken, setBroken] = useState(false)

  const displayName = useMemo(() => fallback || user?.username || '', [fallback, user?.username])
  const initials = useMemo(() => fallbackInitials(displayName), [displayName])
  const imageSrc = useMemo(() => {
    if (broken) return null
    if (src && typeof src === 'string' && src.length) return src
    return null
  }, [src, broken])

  return (
    <div
      className={`avatar overflow-hidden ${className}`.trim()}
      style={{ width: size, height: size }}
    >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={displayName || 'avatar'}
          className="w-full h-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="text-xs font-medium tracking-wide">{initials}</span>
      )}
    </div>
  )
}
