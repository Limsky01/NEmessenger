import React, { useMemo, useState } from 'react'
import useStore, { buildNameStyle } from '../state/store.js'
import AvatarImage from './AvatarImage.jsx'

function StatusDot({ online }) {
  return <span className={`w-2 h-2 rounded-full ${online ? 'bg-sky-400' : 'bg-white/30'}`} />
}

export default function FriendsView() {
  const users = useStore((s) => s.users)
  const me = useStore((s) => s.user)
  const onlineUserIds = useStore((s) => s.onlineUserIds)
  const openDirectChat = useStore((s) => s.openDirectChat)
  const buildAvatarUrl = useStore((s) => s.buildAvatarUrl)
  const [filter, setFilter] = useState('')

  const onlineSet = useMemo(() => new Set(onlineUserIds), [onlineUserIds])
  const normalized = useMemo(() => filter.trim().toLowerCase(), [filter])
  const rows = useMemo(() => {
    const base = users.filter((user) => user.id !== me?.id)
    if (!normalized) return base
    return base.filter((user) => {
      const haystack = `${user.displayName || ''} ${user.username || ''}`.toLowerCase()
      return haystack.includes(normalized)
    })
  }, [users, me?.id, normalized])
  const getUserNameStyle = (user) => buildNameStyle(user?.nameStyle)

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="panel px-6 py-4 border-b border-white/10 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Друзья</div>
          <div className="text-xs text-white/60">Список пользователей</div>
        </div>
        <div className="w-64">
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Поиск..."
            className="tg-input text-xs placeholder:text-white/40"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin p-6 space-y-3">
        {rows.map((user) => (
          <button
            key={user.id}
            type="button"
            onClick={() => openDirectChat(user.id)}
            className="w-full glass rounded-3xl px-4 py-3 flex items-center justify-between hover:bg-white/10 transition"
          >
            <div className="flex items-center gap-3">
              <AvatarImage user={user} size={36} src={buildAvatarUrl?.(user)} />
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
        {rows.length === 0 && <div className="text-sm text-white/40">Нет пользователей</div>}
      </div>
    </div>
  )
}
