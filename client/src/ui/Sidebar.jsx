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
  const voicePeerStates = useStore((s) => s.voicePeerStates)
  const voiceSpeaking = useStore((s) => s.voiceSpeaking)
  const voiceSelfSocketId = useStore((s) => s.voiceSelfSocketId)
  const updateVoiceRoomMembers = useStore((s) => s.updateVoiceRoomMembers)

  const [searchTerm, setSearchTerm] = useState('')

  const onlineSet = useMemo(() => new Set(onlineUserIds), [onlineUserIds])
  const otherUsers = useMemo(() => users.filter((u) => u.id !== me?.id), [users, me])
  const publicChannels = useMemo(() => channels.filter((channel) => !channel.isPrivate), [channels])
  const privateChannels = useMemo(() => channels.filter((channel) => channel.isPrivate), [channels])
  const voiceParticipantsCount = (roomId) => (voiceParticipants[roomId] || []).length
  const normalizedSearch = useMemo(() => searchTerm.trim().toLowerCase(), [searchTerm])
  const filteredPublicChannels = useMemo(() => {
    if (!normalizedSearch) return publicChannels
    return publicChannels.filter((channel) => channel.name.toLowerCase().includes(normalizedSearch))
  }, [publicChannels, normalizedSearch])
  const filteredPrivateChannels = useMemo(() => {
    if (!normalizedSearch) return privateChannels
    return privateChannels.filter((channel) => channel.name.toLowerCase().includes(normalizedSearch))
  }, [privateChannels, normalizedSearch])
  const filteredUsers = useMemo(() => {
    if (!normalizedSearch) return otherUsers
    return otherUsers.filter((user) => user.username.toLowerCase().includes(normalizedSearch))
  }, [otherUsers, normalizedSearch])
  const filteredVoiceRooms = useMemo(() => {
    if (!normalizedSearch) return voiceRooms
    return voiceRooms.filter((room) => room.name.toLowerCase().includes(normalizedSearch))
  }, [voiceRooms, normalizedSearch])

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [channelName, setChannelName] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [voiceDialogOpen, setVoiceDialogOpen] = useState(false)
  const [voiceName, setVoiceName] = useState('')
  const [voiceSelectedIds, setVoiceSelectedIds] = useState([])
  const [voiceModeratorIds, setVoiceModeratorIds] = useState([])
  const [voiceSaving, setVoiceSaving] = useState(false)
  const [voiceError, setVoiceError] = useState(null)
  const [editingRoom, setEditingRoom] = useState(null)
  const [showPublic, setShowPublic] = useState(true)
  const [showPrivate, setShowPrivate] = useState(true)
  const [showUsers, setShowUsers] = useState(true)
  const [showVoice, setShowVoice] = useState(true)

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

  const resetVoiceDialog = () => {
    setVoiceDialogOpen(false)
    setVoiceName('')
    setVoiceSelectedIds([])
    setVoiceModeratorIds([])
    setVoiceError(null)
    setEditingRoom(null)
  }

  const closeVoiceDialog = () => {
    if (voiceSaving) return
    resetVoiceDialog()
  }

  const toggleVoiceSelection = (userId) => {
    setVoiceSelectedIds((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]))
    setVoiceModeratorIds((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : current))
  }

  const toggleVoiceModerator = (userId) => {
    setVoiceModeratorIds((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]))
  }

  const handleSubmitVoiceRoom = async () => {
    if (voiceSaving) return
    if (!editingRoom && !voiceName.trim()) {
      setVoiceError('Укажите название комнаты')
      return
    }
    setVoiceSaving(true)
    setVoiceError(null)
    try {
      if (editingRoom) {
        const baseMembers = (editingRoom.members || []).filter((m) => m.userId !== editingRoom.createdBy)
        const selectedSet = new Set(voiceSelectedIds)
        const remove = baseMembers.filter((member) => !selectedSet.has(member.userId)).map((member) => member.userId)
        const upserts = Array.from(selectedSet).map((userId) => {
          const role = voiceModeratorIds.includes(userId) ? 'admin' : 'member'
          const existing = baseMembers.find((m) => m.userId === userId)
          if (existing && existing.role === role) return null
          return { userId, role }
        })
        const filtered = upserts.filter(Boolean)
        await updateVoiceRoomMembers(editingRoom.id, { upserts: filtered, remove })
      } else {
        await createVoiceRoom(voiceName, { members: voiceSelectedIds, admins: voiceModeratorIds })
      }
      resetVoiceDialog()
    } catch (err) {
      console.error('voice room submit failed', err)
      setVoiceError(editingRoom ? 'Не удалось обновить участников' : 'Не удалось создать комнату')
    } finally {
      setVoiceSaving(false)
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
        <div>
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Поиск каналов, пользователей..."
            className="w-full bg-white/10 rounded-2xl px-4 py-2 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30"
          />
        </div>
      </div>

      <div className="px-3 pt-3 pb-6 overflow-y-auto scroll-thin space-y-6 flex-1">
        <div className="space-y-2">
          <div className="px-2 text-xs uppercase tracking-[0.2em] text-white/40 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowPublic((value) => !value)}
              className="flex items-center gap-2 text-white/60 hover:text-white/90 transition"
            >
              <span className="text-base leading-none">{showPublic ? '−' : '+'}</span>
              <span>Общие каналы</span>
            </button>
            <span className="text-white/30 text-[11px]">{filteredPublicChannels.length}</span>
          </div>
          {showPublic ? (
            filteredPublicChannels.length > 0 ? (
              filteredPublicChannels.map((channel) => {
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
              })
            ) : (
              <div className="text-sm text-white/40 px-2">Общих каналов пока нет</div>
            )
          ) : (
            <div className="text-xs text-white/30 px-2">Секция скрыта</div>
          )}
        </div>

        <div className="space-y-2">
          <div className="px-2 text-xs uppercase tracking-[0.2em] text-white/40 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowPrivate((value) => !value)}
              className="flex items-center gap-2 text-white/60 hover:text-white/90 transition"
            >
              <span className="text-base leading-none">{showPrivate ? '−' : '+'}</span>
              <span>Приватные комнаты</span>
            </button>
            <div className="flex items-center gap-3">
              <span className="text-white/30 text-[11px]">{filteredPrivateChannels.length}</span>
              <button
                type="button"
                onClick={() => setCreateDialogOpen(true)}
                className="text-white/40 hover:text-white/80 transition text-lg leading-none"
                title="Создать приватный канал"
              >
                +
              </button>
            </div>
          </div>
          {showPrivate ? (
            filteredPrivateChannels.length > 0 ? (
              filteredPrivateChannels.map((channel) => {
                const active = channel.id === activeChannelId
                const unreadCount = unread[channel.id] || 0
                const role =
                  channel.membershipRole === 'owner'
                    ? 'Создатель'
                    : channel.membershipRole === 'admin'
                      ? 'Админ'
                      : 'Участник'
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
              })
            ) : (
              <div className="text-sm text-white/40 px-2">Приватных комнат пока нет</div>
            )
          ) : (
            <div className="text-xs text-white/30 px-2">Секция скрыта</div>
          )}
        </div>

        <div>
          <div className="px-2 text-xs uppercase tracking-[0.2em] text-white/40 mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowUsers((value) => !value)}
              className="flex items-center gap-2 text-white/60 hover:text-white/90 transition"
            >
              <span className="text-base leading-none">{showUsers ? '−' : '+'}</span>
              <span>Пользователи</span>
            </button>
            <span className="text-white/30 text-[11px]">{filteredUsers.length}</span>
          </div>
          <div className="space-y-2">
            {showUsers ? (
              filteredUsers.length > 0 ? (
                filteredUsers.map((u) => {
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
                })
              ) : (
                <div className="text-sm text-white/40 px-2">Пользователей пока нет</div>
              )
            ) : (
              <div className="text-xs text-white/30 px-2">Секция скрыта</div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="px-2 text-xs uppercase tracking-[0.2em] text-white/40 mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowVoice((value) => !value)}
              className="flex items-center gap-2 text-white/60 hover:text-white/90 transition"
            >
              <span className="text-base leading-none">{showVoice ? '−' : '+'}</span>
              <span>Голосовые комнаты</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingRoom(null)
                setVoiceName('')
                setVoiceSelectedIds([])
                setVoiceModeratorIds([])
                setVoiceError(null)
                setVoiceDialogOpen(true)
              }}
              className="text-white/40 hover:text-white/80 transition text-lg leading-none"
            >
              +
            </button>
          </div>
          {showVoice ? (
            filteredVoiceRooms.length > 0 ? (
              filteredVoiceRooms.map((room) => {
                const active = activeVoiceRoomId === room.id
                const count = room.participantCount ?? voiceParticipantsCount(room.id)
                const participants = voiceParticipants[room.id] || []
                const canManage = room.membershipRole === 'owner' || room.membershipRole === 'admin'
                return (
                  <div key={room.id} className={`rounded-2xl border border-white/10 px-4 py-3 space-y-3 ${active ? 'panel' : 'glass hover:bg-white/10 transition'}`}>
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
                    {participants.length > 0 && (
                      <div className="flex flex-wrap gap-3 pl-1">
                        {participants.map((p) => {
                          const speaking = voiceSpeaking[p.socketId]
                          const state = voicePeerStates[p.socketId]
                          const user = users.find((u) => u.id === p.userId)
                          const avatarSrc = buildAvatarUrl?.(user)
                          const isSelf = p.socketId === voiceSelfSocketId
                          const badge =
                            state === 'connecting'
                              ? 'Подключение'
                              : state === 'failed'
                              ? 'Ошибка'
                              : state === 'disconnected'
                              ? 'Отключен'
                              : isSelf
                              ? 'Вы'
                              : ''
                          return (
                            <div
                              key={p.socketId}
                              className={`flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/5 border border-white/10 ${speaking ? 'shadow-[0_0_0_2px_rgba(16,185,129,0.6)]' : ''}`}
                            >
                              <div className={`relative w-8 h-8 rounded-full overflow-hidden ${speaking ? 'ring-2 ring-emerald-400/80 ring-offset-2 ring-offset-black/20 transition-all' : 'ring-0'}`}>
                                <AvatarImage user={user || { username: p.username }} size={32} src={avatarSrc} />
                              </div>
                              <div>
                                <div className="text-xs text-white/90">@{p.username || p.userId}</div>
                                {badge && <div className="text-[10px] text-white/40">{badge}</div>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {canManage && (
                      <div className="flex items-center justify-between text-[11px] text-white/40">
                        <div>Роль: {room.membershipRole === 'owner' ? 'Создатель' : 'Администратор'}</div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRoom(room)
                            setVoiceDialogOpen(true)
                            setVoiceName(room.name)
                            const members = room.members || []
                            setVoiceSelectedIds(members.map((m) => m.userId).filter((id) => id !== room.createdBy))
                            setVoiceModeratorIds(members.filter((m) => m.role === 'admin').map((m) => m.userId))
                          }}
                          className="text-white/50 hover:text-white/80 transition"
                        >
                          Управлять
                        </button>
                      </div>
                    )}
                    {me?.id === room.createdBy && !active && (
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
              })
            ) : (
              <div className="text-sm text-white/40 px-2">Голосовые комнаты отсутствуют</div>
            )
          ) : (
            <div className="text-xs text-white/30 px-2">Секция скрыта</div>
          )}
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

      {voiceDialogOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-6" onClick={closeVoiceDialog}>
          <div className="panel w-full max-w-xl rounded-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <div className="text-lg font-semibold text-white/90">
                  {editingRoom ? 'Участники голосовой комнаты' : 'Новая голосовая комната'}
                </div>
                <div className="text-xs text-white/60">
                  {editingRoom ? 'Добавьте или удалите участников и назначьте модераторов' : 'Выберите название и участников'}
                </div>
              </div>
              <button type="button" onClick={closeVoiceDialog} className="text-white/40 hover:text-white/80 transition">
                ✕
              </button>
            </div>
            {voiceError && <div className="px-5 py-3 text-sm text-red-300 bg-red-500/10">{voiceError}</div>}
            <div className="px-5 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
              {!editingRoom && (
                <div className="space-y-2">
                  <label className="text-sm text-white/70" htmlFor="voice-name">
                    Название
                  </label>
                  <input
                    id="voice-name"
                    type="text"
                    value={voiceName}
                    onChange={(e) => setVoiceName(e.target.value)}
                    className="w-full bg-white/10 rounded-2xl px-4 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/40"
                    placeholder="Например, Голосовой проект"
                    disabled={voiceSaving}
                  />
                </div>
              )}
              {editingRoom && (
                <div className="flex items-center gap-3 bg-white/5 px-4 py-3 rounded-2xl">
                  <span className="text-xs uppercase tracking-[0.2em] text-white/30">Комната</span>
                  <span className="text-sm text-white/80">{editingRoom.name}</span>
                </div>
              )}
              {editingRoom && (
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-white/40">Создатель</div>
                  <div className="flex items-center gap-3 bg-white/5 rounded-2xl px-3 py-2">
                    <AvatarImage user={users.find((u) => u.id === editingRoom.createdBy)} size={28} src={buildAvatarUrl?.(users.find((u) => u.id === editingRoom.createdBy))} />
                    <div className="text-sm text-white/80">
                      @{users.find((u) => u.id === editingRoom.createdBy)?.username || editingRoom.createdBy}
                    </div>

                    <span className="text-[11px] text-white/40">Создатель</span>

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
                </div>
              )}
              <div className="space-y-3">
                <div className="text-xs uppercase tracking-[0.2em] text-white/40">Участники</div>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {otherUsers.map((user) => {
                    const checked = voiceSelectedIds.includes(user.id)
                    const moderator = voiceModeratorIds.includes(user.id)
                    const isLocked = editingRoom?.createdBy === user.id
                    return (
                      <div key={user.id} className="rounded-2xl bg-white/5 hover:bg-white/10 transition p-3 space-y-2">
                        <label className="flex items-center justify-between gap-3 cursor-pointer">
                          <div className="flex items-center gap-3">
                            <AvatarImage user={user} size={32} src={buildAvatarUrl?.(user)} />
                            <div className="text-sm text-white/80">@{user.username}</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={checked || isLocked}
                            onChange={() => toggleVoiceSelection(user.id)}
                            disabled={voiceSaving || isLocked}
                          />
                        </label>
                        {(checked || isLocked) && (
                          <label className="flex items-center gap-2 text-xs text-white/60 pl-10">
                            <input
                              type="checkbox"
                              checked={isLocked ? true : moderator}
                              onChange={() => toggleVoiceModerator(user.id)}
                              disabled={voiceSaving || isLocked}
                            />
                            {isLocked ? 'Администратор' : 'Назначить модератором'}
                          </label>
                        )}
                      </div>
                    )
                  })}
                  {otherUsers.length === 0 && <div className="text-sm text-white/40">Других пользователей пока нет</div>}
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-white/10 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeVoiceDialog}
                className="px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 transition text-sm"
                disabled={voiceSaving}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleSubmitVoiceRoom}
                className="px-4 py-2 rounded-2xl bg-white/80 text-black hover:bg-white disabled:bg-white/30 disabled:text-white/40 text-sm"
                disabled={voiceSaving}
              >
                {voiceSaving ? 'Сохранение…' : editingRoom ? 'Сохранить' : 'Создать'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
