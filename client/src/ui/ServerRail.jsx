import React from 'react'
import useStore from '../state/store.js'
import AvatarImage from './AvatarImage.jsx'

const railButtonClass = (active) =>
  `tg-rail-button button-press ${active ? 'tg-rail-button--active' : ''}`

export default function ServerRail() {
  const me = useStore((s) => s.user)
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const channels = useStore((s) => s.channels)
  const activeChannelId = useStore((s) => s.activeChannelId)
  const switchChannel = useStore((s) => s.switchChannel)
  const openProfile = useStore((s) => s.openProfile)
  const openSettings = useStore((s) => s.openSettings)
  const openAdmin = useStore((s) => s.openAdmin)
  const buildAvatarUrl = useStore((s) => s.buildAvatarUrl)
  const buildChannelAvatarUrl = useStore((s) => s.buildChannelAvatarUrl)

  return (
    <div className="w-16 tg-rail flex flex-col items-center py-4 gap-3">
      <button
        type="button"
        onClick={() => setView('dm')}
        className={railButtonClass(view === 'dm')}
        title="Личные сообщения"
        aria-label="Личные сообщения"
      >
        DM
      </button>

      <div className="h-px w-8 bg-white/10" />

      <div className="flex-1 w-full flex flex-col items-center gap-3 overflow-y-auto scroll-thin px-2">
        {channels.map((channel) => {
          const active = view === 'chat' && channel.id === activeChannelId
          const avatarSrc = buildChannelAvatarUrl?.(channel)
          return (
            <button
              key={channel.id}
              type="button"
              onClick={() => switchChannel(channel.id)}
              className={railButtonClass(active)}
              title={channel.name}
              aria-label={channel.name}
            >
              {avatarSrc ? (
                <AvatarImage user={{ username: channel.name }} size={28} src={avatarSrc} />
              ) : (
                channel.name.slice(0, 1).toUpperCase()
              )}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setView('chat')}
          className={railButtonClass(false)}
          title="Добавить группу"
          aria-label="Добавить группу"
        >
          +
        </button>
      </div>

      <button
        type="button"
        onClick={openProfile}
        className={railButtonClass(view === 'profile')}
        title="Профиль"
        aria-label="Профиль"
      >
        <AvatarImage user={me} size={32} src={buildAvatarUrl?.(me)} />
      </button>

      {me?.role === 'admin' && (
        <button
          type="button"
          onClick={openAdmin}
          className={railButtonClass(view === 'admin')}
          title="Админ"
          aria-label="Админ"
        >
          AD
        </button>
      )}

      <button
        type="button"
        onClick={openSettings}
        className={railButtonClass(view === 'settings')}
        title="Настройки"
        aria-label="Настройки"
      >
        ST
      </button>
    </div>
  )
}
