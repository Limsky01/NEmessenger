import React, { useMemo, useState } from 'react'
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
  const voiceRooms = useStore((s) => s.voiceRooms)
  const activeVoiceRoomId = useStore((s) => s.activeVoiceRoomId)
  const voiceParticipants = useStore((s) => s.voiceParticipants)
  const joinVoiceRoom = useStore((s) => s.joinVoiceRoom)
  const leaveVoiceRoom = useStore((s) => s.leaveVoiceRoom)
  const createVoiceRoom = useStore((s) => s.createVoiceRoom)
  const deleteVoiceRoom = useStore((s) => s.deleteVoiceRoom)
  const voiceStatus = useStore((s) => s.voiceStatus)
  const createPrivateChannel = useStore((s) => s.createPrivateChannel)

  const onlineSet = useMemo(() => new Set(onlineUserIds), [onlineUserIds])
  const otherUsers = useMemo(() => users.filter((u) => u.id !== me?.id), [users, me])
  const publicChannels = useMemo(() => channels.filter((channel) => !channel.isPrivate), [channels])
  const privateChannels = useMemo(() => channels.filter((channel) => channel.isPrivate), [channels])
  const voiceParticipantsCount = (roomId) => (voiceParticipants[roomId] || []).length

  const handleCreateVoiceRoom = () => {
    const name = window.prompt('Название голосовой комнаты')
    if (!name) return
    createVoiceRoom(name).catch((err) => console.error('create voice room failed', err))
  }

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [channelName, setChannelName] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)

  const toggleSelection = (userId) => {
    setSelectedIds((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]))
  }

  const closeCreateDialog = () => {
    if (creating) return
    setCreateDialogOpen(false)
    setChannelName('')
    setSelectedIds([])
    setCreateError(null)
  }

  const handleCreatePrivateChannel = async () => {
    if (creating) return
    if (!channelName.trim()) {
      setCreateError('Введите название канала')
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      const channel = await createPrivateChannel(channelName, selectedIds)
      if (channel?.id) switchChannel(channel.id)
      closeCreateDialog()
    } catch (err) {
      console.error('create private channel failed', err)
      setCreateError('Не удалось создать канал')
    } finally {
      setCreating(false)
    }
  }

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
          <div className="px-2 text-xs uppercase tracking-[0.2em] text-white/40">Общие каналы</div>
          {publicChannels.map((channel) => {
            const active = channel.id === activeChannelId
            const unreadCount = unread[channel.id] || 0
            return (
              <button
                key={channel.id}
                type="button"
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
          {publicChannels.length === 0 && <div className="text-sm text-white/40 px-2">Общих каналов пока нет</div>}
        </div>

        <div className="space-y-2">
          <div className="px-2 text-xs uppercase tracking-[0.2em] text-white/40 flex items-center justify-between">
            <span>Приватные комнаты</span>
            <button
              type="button"
              onClick={() => setCreateDialogOpen(true)}
              className="text-white/40 hover:text-white/80 transition text-lg leading-none"
            >
              +
            </button>
          </div>
          {privateChannels.map((channel) => {
            const active = channel.id === activeChannelId
            const unreadCount = unread[channel.id] || 0
            const role = channel.membershipRole === 'owner' ? 'Создатель' : channel.membershipRole === 'admin' ? 'Админ' : 'Участник'
            return (
              <button
                key={channel.id}
                type="button"
                onClick={() => switchChannel(channel.id)}
                className={`w-full flex items-center justify-between px-3 py-3 rounded-2xl transition-colors ${active ? 'panel' : 'glass hover:bg-white/10'}`}
              >
                <div className="flex items-center gap-3">
                  <div className="avatar">🔒</div>
                  <div>
                    <div className="text-sm font-medium">{channel.name}</div>
                    <div className="text-xs text-white/60 flex items-center gap-2">
                      <span>{role}</span>
                      <span>•</span>
                      <span>{channel.memberCount} участн.</span>
                    </div>
                  </div>
                </div>
                {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
              </button>
            )
          })}
          {privateChannels.length === 0 && <div className="text-sm text-white/40 px-2">Приватных комнат пока нет</div>}
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

        <div className="space-y-2">
          <div className="px-2 text-xs uppercase tracking-[0.2em] text-white/40 mb-2 flex items-center justify-between">
            <span>Голосовые комнаты</span>
            {me?.role === 'admin' && (
              <button
                type="button"
                onClick={handleCreateVoiceRoom}
                className="text-white/40 hover:text-white/80 transition text-lg leading-none"
              >
                +
              </button>
            )}
          </div>
          {voiceRooms.map((room) => {
            const active = activeVoiceRoomId === room.id
            const count = room.participantCount ?? voiceParticipantsCount(room.id)
            const participants = voiceParticipants[room.id] || []
            return (
              <div key={room.id} className={`rounded-2xl border border-white/10 px-4 py-3 space-y-2 ${active ? 'panel' : 'glass hover:bg-white/10 transition'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium flex items-center gap-2">
                      <span role="img" aria-label="voice">🎙️</span>
                      {room.name}
                    </div>
                    <div className="text-xs text-white/50">В голосе: {count}</div>
                    {active && voiceStatus && (
                      <div className="text-[11px] text-white/40">
                        {voiceStatus === 'connecting'
                          ? 'Подключение...'
                          : voiceStatus === 'error'
                          ? 'Ошибка соединения'
                          : voiceStatus === 'room_closed'
                          ? 'Комната закрыта'
                          : 'Подключено'}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => (active ? leaveVoiceRoom() : joinVoiceRoom(room.id))}
                    className={`px-3 py-1.5 text-xs rounded-xl transition ${active ? 'bg-red-500/30 hover:bg-red-500/40 text-red-200' : 'bg-white/10 hover:bg-white/20 text-white/80'}`}
                  >
                    {active ? 'Выйти' : 'Подключиться'}
                  </button>
                </div>
                {active && participants.length > 0 && (
                  <div className="pl-6 space-y-1 text-xs text-white/60">
                    {participants.map((p) => (
                      <div key={p.socketId}>@{p.username || p.userId}</div>
                    ))}
                  </div>
                )}
                {me?.role === 'admin' && !active && (
                  <button
                    type="button"
                    onClick={() => deleteVoiceRoom(room.id).catch((err) => console.error('delete voice room failed', err))}
                    className="text-xs text-white/40 hover:text-red-300 transition"
                  >
                    Удалить
                  </button>
                )}
              </div>
            )
          })}
          {voiceRooms.length === 0 && <div className="text-sm text-white/40 px-2">Голосовые комнаты отсутствуют</div>}
        </div>
      </div>

      {createDialogOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-6" onClick={closeCreateDialog}>
          <div className="panel w-full max-w-lg rounded-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <div className="text-lg font-semibold text-white/90">Новая приватная комната</div>
                <div className="text-xs text-white/60">Выберите название и участников</div>
              </div>
              <button type="button" onClick={closeCreateDialog} className="text-white/40 hover:text-white/80 transition">
                ✕
              </button>
            </div>
            {createError && <div className="px-5 py-3 text-sm text-red-300 bg-red-500/10">{createError}</div>}
            <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-2">
                <label className="text-sm text-white/70" htmlFor="new-channel-name">
                  Название
                </label>
                <input
                  id="new-channel-name"
                  type="text"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  className="w-full bg-white/10 rounded-2xl px-4 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/40"
                  placeholder="Например, Проект А"
                  disabled={creating}
                />
              </div>
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.2em] text-white/40">Участники</div>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {otherUsers.map((user) => {
                    const checked = selectedIds.includes(user.id)
                    return (
                      <label
                        key={user.id}
                        className="flex items-center justify-between gap-3 bg-white/5 hover:bg-white/10 transition px-3 py-2 rounded-2xl"
                      >
                        <div className="flex items-center gap-3">
                          <AvatarImage user={user} size={28} src={buildAvatarUrl?.(user)} />
                          <div className="text-sm text-white/80">@{user.username}</div>
                        </div>
                        <input type="checkbox" checked={checked} onChange={() => toggleSelection(user.id)} disabled={creating} />
                      </label>
                    )
                  })}
                  {otherUsers.length === 0 && <div className="text-sm text-white/40">Больше нет пользователей</div>}
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-white/10 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeCreateDialog}
                className="px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 transition text-sm"
                disabled={creating}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleCreatePrivateChannel}
                className="px-4 py-2 rounded-2xl bg-white/80 text-black hover:bg-white disabled:bg-white/30 disabled:text-white/40 text-sm"
                disabled={creating}
              >
                {creating ? 'Создание...' : 'Создать'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
