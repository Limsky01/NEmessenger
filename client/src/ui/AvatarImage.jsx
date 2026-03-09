import React, { useEffect, useMemo, useState } from 'react'

const fallbackInitials = (value) => {
  if (!value) return '??'
  const trimmed = value.toString().trim()
  if (!trimmed) return '??'
  return trimmed.slice(0, 2).toUpperCase()
}

export default function AvatarImage({ user, size = 36, className = '', src, fallback }) {
  const [broken, setBroken] = useState(false)
  const [resolvedSrc, setResolvedSrc] = useState(null)

  useEffect(() => {
    setBroken(false)
  }, [src])

  useEffect(() => {
    if (!src || typeof src !== 'string') {
      setResolvedSrc(null)
      return undefined
    }
    if (src.startsWith('blob:') || src.startsWith('data:') || !/ngrok-free\.(dev|app)/i.test(src)) {
      setResolvedSrc(src)
      return undefined
    }

    const controller = new AbortController()
    let objectUrl = null

    fetch(src, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'ngrok-skip-browser-warning': 'true' },
    })
      .then((response) => {
        if (!response.ok) throw new Error(`avatar_http_${response.status}`)
        return response.blob()
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        setResolvedSrc(objectUrl)
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        setResolvedSrc(src)
      })

    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src])

  const displayName = useMemo(
    () => fallback || user?.displayName || user?.username || '',
    [fallback, user?.displayName, user?.username],
  )
  const initials = useMemo(() => fallbackInitials(displayName), [displayName])
  const imageSrc = useMemo(() => {
    if (broken) return null
    if (resolvedSrc && typeof resolvedSrc === 'string' && resolvedSrc.length) return resolvedSrc
    return null
  }, [resolvedSrc, broken])

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
