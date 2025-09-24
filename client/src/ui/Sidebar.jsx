import React, { useMemo } from 'react'
import useStore, { buildDirectChannelId } from '../state/store.js'
import AvatarImage from './AvatarImage.jsx'

function StatusDot({ online }) {
  return <span className={`w-2 h-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-white/30'}`} />
}

export default function Sidebar() {
  const channels = useStore((s) => s.channels)
  const activeChannelId = useStore((s) => s.activeChannelId)
  const switchChannel = useStore((s) => s.switchChannel)
  const unread = useStore((s) => s.unread)
  const users = useStore((s) => s.users)
  const me = useStore((s) => s.user)
  const onlineUserIds = useStore((s) => s.onlineUserIds)
  const openProfile = useStore((s) => s.openProfile)
  const openAdmin = useStore((s) => s.openAdmin)
  const view = useStore((s) => s.view)
  const openDirectChat = useStore((s) => s.openDirectChat)
  const directPeers = useStore((s) => s.directPeers)
  const buildAvatarUrl = useStore((s) => s.buildAvatarUrl)

  const onlineSet = useMemo(() => new Set(onlineUserIds), [onlineUserIds])
  const otherUsers = useMemo(() => users.filter((u) => u.id !== me?.id), [users, me])

  return (
    <div className="w-[320px] border-r border-white/10 h-full flex flex-col bg-white/5 backdrop-blur-md">
      <div className="p-4 panel sticky top-0 space-y-3 z-10">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium">@{me?.username || 'user'}</div>
            <div className="text-[11px] text-white/40">ID: {me?.id}</div>
          </div>
          <div className="flex items-center gap-2">
            {me?.role === 'admin' && (
              <button
                type="button"
                onClick={openAdmin}
                className={`px-3 py-1.5 text-xs rounded-xl transition button-press ${view === 'admin' ? 'bg-white/25 text-white' : 'bg-white/10 hover:bg-white/20'}`}
              >
                Админ
              </button>
            )}
            <button
              type="button"
              onClick={openProfile}
              className={`px-3 py-1.5 text-xs rounded-xl transition button-press ${view === 'profile' ? 'bg-white/25 text-white' : 'bg-white/10 hover:bg-white/20'}`}
            >
              Профиль
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-white/60">
          <span>Каналы</span>
          <span>({channels.length})</span>
        </div>
      </div>

      <div className="px-3 pt-3 pb-6 overflow-y-auto scroll-thin space-y-6 flex-1">
        <div className="space-y-2">
          {channels.map((channel) => {
            const active = channel.id === activeChannelId
            const unreadCount = unread[channel.id] || 0
            return (
              <button
                key={channel.id}
                onClick={() => switchChannel(channel.id)}
                className={`w-full flex items-center justify-between px-3 py-3 rounded-2xl transition-colors ${active ? 'panel' : 'glass hover:bg-white/10'}`}
              >
                <div className="flex items-center gap-3">
                  <div className="avatar">#{channel.name.slice(0, 2).toUpperCase()}</div>
                  <div>
                    <div className="text-sm font-medium">#{channel.name}</div>
                    <div className="text-xs text-white/60">Общий канал</div>
                  </div>
                </div>
                {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
              </button>
            )
          })}
          {channels.length === 0 && <div className="text-sm text-white/40 px-2">Каналов пока нет</div>}
        </div>

        <div>
          <div className="px-2 text-xs uppercase tracking-[0.2em] text-white/40 mb-2">Пользователи</div>
          <div className="space-y-2">
            {otherUsers.map((u) => {
              const channelId = buildDirectChannelId(me?.id, u.id)
              const active = activeChannelId === channelId
              const unreadCount = unread[channelId] || 0
              const peerId = directPeers[channelId]
              const label = peerId ? users.find((user) => user.id === peerId)?.username || u.username : u.username
              const isOnline = onlineSet.has(u.id)
              const avatarSrc = buildAvatarUrl?.(u)
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => openDirectChat(u.id)}
                  className={`w-full flex items-center justify-between px-3 py-3 rounded-2xl ${active ? 'panel' : 'glass hover:bg-white/10'} transition`}
                >
                  <div className="flex items-center gap-3">
                    <AvatarImage user={u} src={avatarSrc} />
                    <div>
                      <div className="text-sm font-medium">@{label}</div>
                      <div className="text-[11px] text-white/50 flex items-center gap-2">
                        <StatusDot online={isOnline} />
                        <span>{isOnline ? 'онлайн' : 'офлайн'}</span>
                      </div>
                    </div>
                  </div>
                  {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
                </button>
              )
            })}
            {otherUsers.length === 0 && <div className="text-sm text-white/40 px-2">Пользователей пока нет</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
