import React, { useMemo, useState } from 'react'
import useStore, { buildNameStyle } from '../state/store.js'
import AvatarImage from './AvatarImage.jsx'

function StatusDot({ online }) {
  return <span className={`w-2 h-2 rounded-full ${online ? 'bg-sky-400' : 'bg-white/30'}`} />
}

export default function DirectsSidebar() {
  const users = useStore((s) => s.users)
  const me = useStore((s) => s.user)
  const onlineUserIds = useStore((s) => s.onlineUserIds)
  const openDirectChat = useStore((s) => s.openDirectChat)
  const buildAvatarUrl = useStore((s) => s.buildAvatarUrl)
  const [search, setSearch] = useState('')

  const onlineSet = useMemo(() => new Set(onlineUserIds), [onlineUserIds])
  const normalized = useMemo(() => search.trim().toLowerCase(), [search])
  const filtered = useMemo(() => {
    const base = users.filter((user) => user.id !== me?.id)
    if (!normalized) return base
    return base.filter((user) => {
      const haystack = `${user.displayName || ''} ${user.username || ''}`.toLowerCase()
      return haystack.includes(normalized)
    })
  }, [users, me?.id, normalized])
  const getUserNameStyle = (user) => buildNameStyle(user?.nameStyle)

  return (
    <div className="w-72 border-r border-white/10 bg-[#101822] flex flex-col">
      <div className="p-4 panel sticky top-0 space-y-3 z-10">
        <div className="text-xs uppercase tracking-[0.3em] text-white/50">Диалоги</div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск друзей..."
          className="tg-input text-xs placeholder:text-white/40"
        />
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin px-3 py-4 space-y-2">
        {filtered.map((user) => (
          <button
            key={user.id}
            type="button"
            onClick={() => openDirectChat(user.id)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-2xl panel hover:bg-white/10 transition"
          >
            <div className="flex items-center gap-3">
              <AvatarImage user={user} size={28} src={buildAvatarUrl?.(user)} />
              <div>
                <div className="text-sm font-medium" style={getUserNameStyle(user)}>
                  {user.displayName || user.username}
                </div>
                <div className="text-xs text-white/60">{onlineSet.has(user.id) ? 'Онлайн' : 'Оффлайн'}</div>
              </div>
            </div>
            <StatusDot online={onlineSet.has(user.id)} />
          </button>
        ))}
        {filtered.length === 0 && <div className="text-sm text-white/40 px-2">Нет пользователей</div>}
      </div>
    </div>
  )
}
