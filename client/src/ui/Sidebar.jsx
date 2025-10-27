import React, { useEffect, useMemo, useRef, useState } from 'react'
import useStore, { buildDirectChannelId } from '../state/store.js'
import AvatarImage from './AvatarImage.jsx'

function StatusDot({ online }) {
  return <span className={`w-2 h-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-white/30'}`} />
}

const DEFAULT_SIDEBAR_WIDTH = 320
const MIN_SIDEBAR_WIDTH = 260
const MAX_SIDEBAR_WIDTH = 480
const SIDEBAR_WIDTH_STORAGE_KEY = 'nemessenger.sidebarWidth'

function clampSidebarWidth(value) {
  if (!Number.isFinite(value)) return DEFAULT_SIDEBAR_WIDTH
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(value)))
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
  const openSettings = useStore((s) => s.openSettings)
  const openAdmin = useStore((s) => s.openAdmin)
  const view = useStore((s) => s.view)
  const openDirectChat = useStore((s) => s.openDirectChat)
  const directPeers = useStore((s) => s.directPeers)
  const buildAvatarUrl = useStore((s) => s.buildAvatarUrl)
  const buildChannelAvatarUrl = useStore((s) => s.buildChannelAvatarUrl)
  const voiceRooms = useStore((s) => s.voiceRooms)
  const activeVoiceRoomId = useStore((s) => s.activeVoiceRoomId)
  const voiceParticipants = useStore((s) => s.voiceParticipants)
  const joinVoiceRoom = useStore((s) => s.joinVoiceRoom)
  const leaveVoiceRoom = useStore((s) => s.leaveVoiceRoom)
  const createVoiceRoom = useStore((s) => s.createVoiceRoom)
  const deleteVoiceRoom = useStore((s) => s.deleteVoiceRoom)
  const uploadChannelAvatar = useStore((s) => s.uploadChannelAvatar)
  const uploadVoiceRoomAvatar = useStore((s) => s.uploadVoiceRoomAvatar)
  const deleteVoiceRoomAvatar = useStore((s) => s.deleteVoiceRoomAvatar)
  const buildVoiceRoomAvatarUrl = useStore((s) => s.buildVoiceRoomAvatarUrl)
  const voiceStatus = useStore((s) => s.voiceStatus)
  const createPrivateChannel = useStore((s) => s.createPrivateChannel)
  const voicePeerStates = useStore((s) => s.voicePeerStates)
  const voiceSpeaking = useStore((s) => s.voiceSpeaking)
  const voiceSelfSocketId = useStore((s) => s.voiceSelfSocketId)
  const updateVoiceRoomMembers = useStore((s) => s.updateVoiceRoomMembers)

  const navButtonClass = (active) =>
    `w-9 h-9 flex items-center justify-center rounded-xl transition button-press ${
      active ? 'bg-white/25 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
    }`

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

  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const [sidebarWidthLoaded, setSidebarWidthLoaded] = useState(false)
  const resizeStateRef = useRef({ startX: 0, width: DEFAULT_SIDEBAR_WIDTH })

  const sidebarStyle = useMemo(
    () => ({
      width: sidebarWidth,
      minWidth: MIN_SIDEBAR_WIDTH,
      maxWidth: MAX_SIDEBAR_WIDTH,
      flexBasis: sidebarWidth,
    }),
    [sidebarWidth]
  )

  const handleResizePointerDown = (event) => {
    if (event.button !== 0 && event.pointerType !== 'touch') return
    event.preventDefault()
    event.stopPropagation()
    if (!Number.isFinite(event.clientX)) return
    resizeStateRef.current = { startX: event.clientX, width: sidebarWidth }
    setIsResizing(true)
  }

  const handleResizeDoubleClick = () => {
    setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = Number.parseInt(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY), 10)
      if (!Number.isNaN(stored)) {
        setSidebarWidth(clampSidebarWidth(stored))
      }
    } catch (err) {
      console.warn('sidebar width restore failed', err)
    }
    setSidebarWidthLoaded(true)
  }, [])

  useEffect(() => {
    if (!sidebarWidthLoaded || typeof window === 'undefined') return
    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth))
    } catch (err) {
      console.warn('sidebar width persist failed', err)
    }
  }, [sidebarWidth, sidebarWidthLoaded])

  useEffect(() => {
    if (isResizing) return
    resizeStateRef.current.width = sidebarWidth
  }, [sidebarWidth, isResizing])

  useEffect(() => {
    if (!isResizing || typeof window === 'undefined') return undefined

    const handlePointerMove = (event) => {
      if (!Number.isFinite(event.clientX)) return
      if (event.buttons === 0 && event.pointerType !== 'touch') {
        setIsResizing(false)
        return
      }
      const nextWidth = clampSidebarWidth(
        resizeStateRef.current.width + (event.clientX - resizeStateRef.current.startX)
      )
      setSidebarWidth((current) => (current === nextWidth ? current : nextWidth))
    }

    const stopResize = () => {
      setIsResizing(false)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResize)
    window.addEventListener('pointercancel', stopResize)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResize)
      window.removeEventListener('pointercancel', stopResize)
    }
  }, [isResizing])

  useEffect(() => {
    if (!isResizing || typeof document === 'undefined') return undefined
    const { style } = document.body
    const previousUserSelect = style.userSelect
    const previousCursor = style.cursor
    style.userSelect = 'none'
    style.cursor = 'ew-resize'
    return () => {
      style.userSelect = previousUserSelect
      style.cursor = previousCursor
    }
  }, [isResizing])

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
  const [channelAvatarFile, setChannelAvatarFile] = useState(null)
  const [channelAvatarPreview, setChannelAvatarPreview] = useState('')
  const [channelAvatarError, setChannelAvatarError] = useState(null)
  const [voiceAvatarFile, setVoiceAvatarFile] = useState(null)
  const [voiceAvatarPreview, setVoiceAvatarPreview] = useState('')
  const [voiceAvatarError, setVoiceAvatarError] = useState(null)
  const [voiceAvatarRemove, setVoiceAvatarRemove] = useState(false)

  const editingCount =
    editingRoom?.participantCount ??
    (editingRoom ? voiceParticipantsCount(editingRoom.id) : undefined)
  const editingActive = editingRoom ? activeVoiceRoomId === editingRoom.id : false

  useEffect(() => () => {
    if (channelAvatarPreview && channelAvatarPreview.startsWith('blob:')) {
      URL.revokeObjectURL(channelAvatarPreview)
    }
  }, [channelAvatarPreview])

  useEffect(() => () => {
    if (voiceAvatarPreview && voiceAvatarPreview.startsWith('blob:')) {
      URL.revokeObjectURL(voiceAvatarPreview)
    }
  }, [voiceAvatarPreview])

  const toggleSelection = (userId) => {
    setSelectedIds((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]))
  }

  const handleChannelAvatarChange = (event) => {
    const file = event.target.files?.[0]
    setChannelAvatarError(null)
    if (file) {
      setChannelAvatarFile(file)
      setChannelAvatarPreview(URL.createObjectURL(file))
    } else {
      setChannelAvatarFile(null)
      setChannelAvatarPreview('')
    }
  }

  const clearChannelAvatarSelection = () => {
    setChannelAvatarFile(null)
    setChannelAvatarPreview('')
    setChannelAvatarError(null)
  }

  const closeCreateDialog = () => {
    if (creating) return
    setCreateDialogOpen(false)
    setChannelName('')
    setSelectedIds([])
    setCreateError(null)
    clearChannelAvatarSelection()
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
      if (channel?.id && channelAvatarFile) {
        try {
          await uploadChannelAvatar(channel.id, channelAvatarFile)
        } catch (err) {
          console.error('channel avatar upload failed', err)
          setCreateError('Не удалось загрузить аватар канала')
          setCreating(false)
          return
        }
      }
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
    clearVoiceAvatarSelection()
    setVoiceAvatarRemove(false)
  }

  const closeVoiceDialog = () => {
    if (voiceSaving) return
    resetVoiceDialog()
  }

  const toggleVoiceSelection = (userId) => {
    setVoiceSelectedIds((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]))
    setVoiceModeratorIds((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : current))
  }

  const handleVoiceAvatarChange = (event) => {
    const file = event.target.files?.[0]
    setVoiceAvatarError(null)
    if (file) {
      setVoiceAvatarFile(file)
      setVoiceAvatarPreview(URL.createObjectURL(file))
      setVoiceAvatarRemove(false)
    } else {
      setVoiceAvatarFile(null)
      setVoiceAvatarPreview('')
    }
  }

  const clearVoiceAvatarSelection = () => {
    setVoiceAvatarFile(null)
    setVoiceAvatarPreview('')
    setVoiceAvatarError(null)
    setVoiceAvatarRemove(false)
  }

  const markVoiceAvatarRemoval = () => {
    setVoiceAvatarFile(null)
    setVoiceAvatarPreview('')
    setVoiceAvatarRemove(true)
    setVoiceAvatarError(null)
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
    setVoiceAvatarError(null)
    try {
      let targetRoom = editingRoom || null
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
        const updated = await updateVoiceRoomMembers(editingRoom.id, { upserts: filtered, remove })
        if (updated) {
          targetRoom = updated
        }
      } else {
        const created = await createVoiceRoom(voiceName, { members: voiceSelectedIds, admins: voiceModeratorIds })
        if (created) {
          targetRoom = created
          setEditingRoom(created)
          const members = created.members || []
          setVoiceSelectedIds(members.map((m) => m.userId).filter((id) => id !== created.createdBy))
          setVoiceModeratorIds(members.filter((m) => m.role === 'admin').map((m) => m.userId))
        }
      }
      if (targetRoom?.id) {
        if (voiceAvatarRemove) {
          try {
            await deleteVoiceRoomAvatar(targetRoom.id)
          } catch (err) {
            console.error('voice room avatar delete failed', err)
            setVoiceAvatarError('Не удалось удалить аватар')
            return
          }
        }
        if (voiceAvatarFile) {
          try {
            await uploadVoiceRoomAvatar(targetRoom.id, voiceAvatarFile)
          } catch (err) {
            console.error('voice room avatar upload failed', err)
            setVoiceAvatarError('Не удалось загрузить аватар')
            return
          }
        }
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
    <div className="relative group flex-shrink-0 border-r border-white/10 h-full flex flex-col bg-white/5 backdrop-blur-md" style={sidebarStyle}>
      <div className="p-4 panel sticky top-0 space-y-3 z-10">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium">@{me?.username || 'user'}</div>
            <div className="text-[11px] text-white/40">ID: {me?.id}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openSettings}
              className={navButtonClass(view === 'settings')}
              aria-label="Настройки"
              title="Настройки"
            >
              <span aria-hidden>&#9881;</span>
              <span className="sr-only">Настройки</span>
            </button>
            {me?.role === 'admin' && (
              <button
                type="button"
                onClick={openAdmin}
                className={navButtonClass(view === 'admin')}
                aria-label="Админ"
                title="Админ"
              >
                <span aria-hidden>&#128296;</span>
                <span className="sr-only">Админ</span>
              </button>
            )}
            <button
              type="button"
              onClick={openProfile}
              className={navButtonClass(view === 'profile')}
              aria-label="Профиль"
              title="Профиль"
            >
              <span aria-hidden>&#128100;</span>
              <span className="sr-only">Профиль</span>
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
                const avatarSrc = buildChannelAvatarUrl?.(channel)
                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => switchChannel(channel.id)}
                    className={`w-full flex items-center justify-between px-3 py-3 rounded-2xl transition-colors ${active ? 'panel' : 'glass hover:bg-white/10'}`}
                  >
                    <div className="flex items-center gap-3">
                      <AvatarImage
                        user={{ username: channel.name }}
                        src={avatarSrc}
                        fallback={channel.name}
                      />
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
                onClick={() => {
                  setCreateError(null)
                  clearChannelAvatarSelection()
                  setCreateDialogOpen(true)
                }}
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
                const avatarSrc = buildChannelAvatarUrl?.(channel)
                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => switchChannel(channel.id)}
                    className={`w-full flex items-center justify-between px-3 py-3 rounded-2xl transition-colors ${active ? 'panel' : 'glass hover:bg-white/10'}`}
                  >
                    <div className="flex items-center gap-3">
                      <AvatarImage
                        user={{ username: channel.name }}
                        src={avatarSrc}
                        fallback={channel.name}
                      />
                      <div>
                        <div className="text-sm font-medium">{channel.name}</div>
                        <div className="text-xs text-white/60 flex items-center gap-2">
                          <span>🔒 {role}</span>
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
                clearVoiceAvatarSelection()
                setVoiceAvatarRemove(false)
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
                      <div className="flex items-center gap-3">
                        <AvatarImage
                          user={{ username: room.name }}
                          src={buildVoiceRoomAvatarUrl?.(room)}
                          fallback={room.name}
                          size={40}
                        />
                        <div>
                          <div className="text-sm font-medium">{room.name}</div>
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
                            setVoiceName(room.name)
                            const members = room.members || []
                            setVoiceSelectedIds(members.map((m) => m.userId).filter((id) => id !== room.createdBy))
                            setVoiceModeratorIds(members.filter((m) => m.role === 'admin').map((m) => m.userId))
                            setVoiceAvatarFile(null)
                            setVoiceAvatarPreview(buildVoiceRoomAvatarUrl?.(room) || '')
                            setVoiceAvatarRemove(false)
                            setVoiceAvatarError(null)
                            setVoiceDialogOpen(true)
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
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.2em] text-white/40">Аватар</div>
                <div className="flex items-center gap-3">
                  <AvatarImage
                    user={{ username: channelName || 'channel' }}
                    size={48}
                    src={channelAvatarPreview || undefined}
                    fallback={channelName || 'Канал'}
                  />
                  <div className="flex flex-col gap-2 text-xs">
                    <label className="cursor-pointer px-3 py-1.5 rounded-2xl bg-white/10 hover:bg-white/20 transition">
                      Выбрать файл
                      <input type="file" accept="image/*" className="hidden" onChange={handleChannelAvatarChange} disabled={creating} />
                    </label>
                    {channelAvatarPreview && (
                      <button type="button" onClick={clearChannelAvatarSelection} className="text-white/50 hover:text-white/80 transition" disabled={creating}>
                        Очистить
                      </button>
                    )}
                  </div>
                </div>
                {channelAvatarError && <div className="text-xs text-red-300">{channelAvatarError}</div>}
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

                  <div className="text-xs text-white/50">В голосе: {editingCount ?? 0}</div>
                  {editingActive && voiceStatus && (
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
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.2em] text-white/40">Аватар</div>
                <div className="flex items-center gap-3">
                  <AvatarImage
                    user={{ username: editingRoom?.name || voiceName || 'voice' }}
                    size={48}
                    src={voiceAvatarPreview || undefined}
                    fallback={editingRoom?.name || voiceName || 'Комната'}
                  />
                  <div className="flex flex-col gap-2 text-xs">
                    <label className="cursor-pointer px-3 py-1.5 rounded-2xl bg-white/10 hover:bg-white/20 transition">
                      Выбрать файл
                      <input type="file" accept="image/*" className="hidden" onChange={handleVoiceAvatarChange} disabled={voiceSaving} />
                    </label>
                    {(voiceAvatarPreview || voiceAvatarFile) && (
                      <button
                        type="button"
                        onClick={clearVoiceAvatarSelection}
                        className="text-white/50 hover:text-white/80 transition"
                        disabled={voiceSaving}
                      >
                        Сбросить
                      </button>
                    )}
                    {editingRoom?.avatarUrl && !voiceAvatarFile && !voiceAvatarRemove && (
                      <button
                        type="button"
                        onClick={markVoiceAvatarRemoval}
                        className="text-white/50 hover:text-white/80 transition"
                        disabled={voiceSaving}
                      >
                        Удалить текущий
                      </button>
                    )}
                    {voiceAvatarRemove && !voiceAvatarFile && (
                      <div className="text-[11px] text-white/50">Аватар будет удалён</div>
                    )}
                  </div>
                </div>
                {voiceAvatarError && <div className="text-xs text-red-300">{voiceAvatarError}</div>}
              </div>
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
      <div
        role="separator"
        aria-label="Изменить ширину боковой панели"
        aria-orientation="vertical"
        aria-valuenow={Math.round(sidebarWidth)}
        aria-valuemin={MIN_SIDEBAR_WIDTH}
        aria-valuemax={MAX_SIDEBAR_WIDTH}
        tabIndex={-1}
        onPointerDown={handleResizePointerDown}
        onDoubleClick={handleResizeDoubleClick}
        className="absolute top-0 -right-1 z-30 h-full w-3 cursor-ew-resize touch-none"
      >
        <div
          className={`mx-auto h-full w-[2px] rounded-full bg-white/40 transition-opacity duration-200 ${isResizing ? 'opacity-80' : 'opacity-0 group-hover:opacity-60'}`}
        />
      </div>
    </div>
  )
}
