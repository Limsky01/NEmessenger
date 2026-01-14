import React, { useEffect, useMemo, useRef, useState } from 'react'
import useStore, { buildDirectChannelId, buildNameStyle } from '../state/store.js'
import AvatarImage from './AvatarImage.jsx'

function StatusDot({ online }) {
  return <span className={`w-2 h-2 rounded-full ${online ? 'bg-sky-400' : 'bg-white/30'}`} />
}

const DEFAULT_SIDEBAR_WIDTH = 320
const MIN_SIDEBAR_WIDTH = 240
const MAX_SIDEBAR_WIDTH = 820
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
  const friends = useStore((s) => s.friends)
  const friendRequests = useStore((s) => s.friendRequests)
  const openDirectChat = useStore((s) => s.openDirectChat)
  const me = useStore((s) => s.user)
  const messagesMap = useStore((s) => s.messages)
  const userStatus = useStore((s) => s.userStatus)
  const setUserStatus = useStore((s) => s.setUserStatus)
  const profileStatus = useStore((s) => s.profileStatus)
  const nameStyleValue = useStore((s) => s.nameStyle)
  const onlineUserIds = useStore((s) => s.onlineUserIds)
  const openSettings = useStore((s) => s.openSettings)
  const view = useStore((s) => s.view)
  const buildAvatarUrl = useStore((s) => s.buildAvatarUrl)
  const buildChannelAvatarUrl = useStore((s) => s.buildChannelAvatarUrl)
  const profileBackground = useStore((s) => s.profileBackground)
  const sendFriendRequest = useStore((s) => s.sendFriendRequest)
  const respondFriendRequest = useStore((s) => s.respondFriendRequest)
  const createPrivateChannel = useStore((s) => s.createPrivateChannel)
  const uploadChannelAvatar = useStore((s) => s.uploadChannelAvatar)

  const [searchTerm, setSearchTerm] = useState('')
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const [sidebarWidthLoaded, setSidebarWidthLoaded] = useState(false)
  const resizeStateRef = useRef({ startX: 0, width: DEFAULT_SIDEBAR_WIDTH })

  const [addFriendName, setAddFriendName] = useState('')
  const [friendError, setFriendError] = useState('')
  const [friendBusy, setFriendBusy] = useState(false)
  const [addFriendOpen, setAddFriendOpen] = useState(false)
  const [selfProfileOpen, setSelfProfileOpen] = useState(false)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [channelName, setChannelName] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [channelAvatarFile, setChannelAvatarFile] = useState(null)
  const [channelAvatarPreview, setChannelAvatarPreview] = useState('')

  const profileBannerStyle = profileBackground
    ? { backgroundImage: `url(${profileBackground})` }
    : undefined
  const meNameStyle = buildNameStyle(nameStyleValue)
  const getUserNameStyle = (user) => buildNameStyle(user?.nameStyle)

  const onlineSet = useMemo(() => new Set(onlineUserIds), [onlineUserIds])
  const normalizedSearch = useMemo(() => searchTerm.trim().toLowerCase(), [searchTerm])
  const filteredFriends = useMemo(() => {
    if (!normalizedSearch) return friends
    return friends.filter((user) => {
      const haystack = `${user.displayName || ''} ${user.username || ''}`.toLowerCase()
      return haystack.includes(normalizedSearch)
    })
  }, [friends, normalizedSearch])
  const filteredGroups = useMemo(() => {
    if (!normalizedSearch) return channels
    return channels.filter((channel) => channel.name.toLowerCase().includes(normalizedSearch))
  }, [channels, normalizedSearch])
  const combinedChats = useMemo(() => {
    const directItems = filteredFriends.map((user) => ({
      type: 'dm',
      id: user.id,
      label: `@${user.username}`,
      user,
    }))
    const groupItems = filteredGroups.map((channel) => ({
      type: 'group',
      id: channel.id,
      label: `#${channel.name}`,
      channel,
    }))
    return [...directItems, ...groupItems]
  }, [filteredFriends, filteredGroups])
  const activeGroup = channels.find((channel) => channel.id === activeChannelId)

  const sidebarStyle = useMemo(
    () => ({
      width: sidebarWidth,
      minWidth: MIN_SIDEBAR_WIDTH,
      maxWidth: MAX_SIDEBAR_WIDTH,
      flexBasis: sidebarWidth,
    }),
    [sidebarWidth],
  )

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
        resizeStateRef.current.width + (event.clientX - resizeStateRef.current.startX),
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

  useEffect(() => () => {
    if (channelAvatarPreview && channelAvatarPreview.startsWith('blob:')) {
      URL.revokeObjectURL(channelAvatarPreview)
    }
  }, [channelAvatarPreview])

  const handleResizePointerDown = (event) => {
    if (event.button !== 0 && event.pointerType !== 'touch') return
    resizeStateRef.current.startX = event.clientX
    resizeStateRef.current.width = sidebarWidth
    setIsResizing(true)
    if (event.currentTarget?.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }

  const handleResizeDoubleClick = () => {
    setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)
  }

  const toggleSelection = (userId) => {
    setSelectedIds((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]))
  }

  const handleChannelAvatarChange = (event) => {
    const file = event.target.files?.[0]
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
  }

  const closeCreateDialog = () => {
    if (creating) return
    setCreateDialogOpen(false)
    setChannelName('')
    setSelectedIds([])
    setCreateError(null)
    clearChannelAvatarSelection()
  }

  const handleCreateGroup = async () => {
    if (creating) return
    if (!channelName.trim()) {
      setCreateError('Введите название группы')
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
          setCreateError('Не удалось загрузить аватар')
          setCreating(false)
          return
        }
      }
      if (channel?.id) switchChannel(channel.id)
      closeCreateDialog()
    } catch (err) {
      console.error('create group failed', err)
      setCreateError('Не удалось создать группу')
    } finally {
      setCreating(false)
    }
  }

  const handleAddFriend = async () => {
    if (!addFriendName.trim()) return
    setFriendBusy(true)
    setFriendError('')
    try {
      await sendFriendRequest(addFriendName.trim())
      setAddFriendName('')
      setAddFriendOpen(false)
    } catch (err) {
      console.error('friend request failed', err)
      setFriendError('Не удалось отправить запрос')
    } finally {
      setFriendBusy(false)
    }
  }

  const incomingRequests = friendRequests?.incoming || []
  const outgoingRequests = friendRequests?.outgoing || []
  const statusOptions = [
    { id: 'online', label: 'В сети', color: 'bg-emerald-400' },
    { id: 'idle', label: 'Неактивен', color: 'bg-yellow-400' },
    { id: 'dnd', label: 'Не беспокоить', color: 'bg-red-500' },
    { id: 'invisible', label: 'Невидимый', color: 'bg-white/40' },
  ]
  const currentStatus = statusOptions.find((option) => option.id === userStatus) || statusOptions[0]

  const getLastMessagePreview = (channelId) => {
    const list = messagesMap[channelId]
    if (!Array.isArray(list) || list.length === 0) return ''
    const last = list[list.length - 1]
    const raw = last?.content
    if (typeof raw !== 'string') return 'Вложение'
    const trimmed = raw.replace(/\s+/g, ' ').trim()
    if (!trimmed) return 'Без текста'
    return trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed
  }

  return (
    <div className="relative group flex-shrink-0 border-r border-white/10 h-full flex flex-col bg-[#0f1720]" style={sidebarStyle}>
      <div className="p-4 sticky top-0 space-y-3 z-10 bg-[#0f1720]">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Чаты</div>
          <button type="button" onClick={() => setAddFriendOpen(true)} className="tg-button text-xs">
            Добавить друга
          </button>
        </div>
        <input
          type="search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Поиск чатов..."
          className="tg-input text-xs placeholder:text-white/40"
        />
      </div>

      <div className="px-3 pt-3 pb-6 overflow-y-auto scroll-thin space-y-5 flex-1">
        {(incomingRequests.length > 0 || outgoingRequests.length > 0) && (
          <div className="space-y-2">
            <div className="px-2 text-xs uppercase tracking-[0.2em] text-white/40">Запросы</div>
            {incomingRequests.map((req) => (
              <div key={req.id} className="panel rounded-2xl px-3 py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AvatarImage user={req.fromUser} size={28} src={buildAvatarUrl?.(req.fromUser)} />
                  <div className="text-xs text-white/80" style={getUserNameStyle(req.fromUser)}>
                    {req.fromUser.displayName || req.fromUser.username}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => respondFriendRequest(req.id, true)}
                    className="text-xs text-sky-300 hover:text-sky-200"
                  >
                    Принять
                  </button>
                  <button
                    type="button"
                    onClick={() => respondFriendRequest(req.id, false)}
                    className="text-xs text-red-300 hover:text-red-200"
                  >
                    Отклонить
                  </button>
                </div>
              </div>
            ))}
            {outgoingRequests.map((req) => (
              <div key={req.id} className="panel rounded-2xl px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AvatarImage user={req.toUser} size={28} src={buildAvatarUrl?.(req.toUser)} />
                  <div className="text-xs text-white/70" style={getUserNameStyle(req.toUser)}>
                    {req.toUser.displayName || req.toUser.username}
                  </div>
                </div>
                <div className="text-[11px] text-white/40">Отправлено</div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <div className="px-2 text-[11px] uppercase tracking-[0.2em] text-white/40 flex items-center justify-between">
            <span>Чаты</span>
            <button
              type="button"
              onClick={() => setCreateDialogOpen(true)}
              className="rounded-full w-6 h-6 flex items-center justify-center bg-white/10 hover:bg-white/20 transition"
              title="Создать группу"
            >
              +
            </button>
          </div>
          {combinedChats.length > 0 ? (
            combinedChats.map((item) => {
              if (item.type === 'dm') {
                const user = item.user
                const isOnline = onlineSet.has(user.id)
                const directId = buildDirectChannelId(me?.id || '', user.id)
                const active = directId && directId === activeChannelId
                const unreadCount = directId ? unread[directId] || 0 : 0
                const lastMessage = directId ? getLastMessagePreview(directId) : ''
                return (
                  <button
                    key={`dm-${user.id}`}
                    type="button"
                    onClick={() => openDirectChat(user.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-2xl overflow-hidden transition-colors ${active ? 'panel' : 'panel hover:bg-white/10'}`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="relative flex-shrink-0">
                        <AvatarImage user={user} size={32} src={buildAvatarUrl?.(user)} />
                        {isOnline ? <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#101822]" /> : null}
                      </div>
                      <div className="min-w-0 text-left">
                        <div className="text-sm font-medium" style={getUserNameStyle(user)}>
                          {user.displayName || user.username}
                        </div>
                        <div className="text-xs text-white/60 truncate">{lastMessage || 'Нет сообщений'}</div>
                      </div>
                    </div>
                    {unreadCount > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="badge">{unreadCount}</span>
                      </div>
                    )}
                  </button>
                )
              }
              const channel = item.channel
              const active = channel.id === activeChannelId
              const unreadCount = unread[channel.id] || 0
              const lastMessage = getLastMessagePreview(channel.id)
              return (
                  <button
                    key={`group-${channel.id}`}
                    type="button"
                    onClick={() => switchChannel(channel.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-2xl overflow-hidden transition-colors ${active ? 'panel' : 'panel hover:bg-white/10'}`}
                  >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-base">#</span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{channel.name}</div>
                      <div className="text-xs text-white/60 truncate">{lastMessage || 'Нет сообщений'}</div>
                    </div>
                  </div>
                  {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
                </button>
              )
            })
          ) : (
            <div className="text-sm text-white/40 px-2">Чатов пока нет</div>
          )}
        </div>
      </div>

      <div className="mt-auto border-t border-white/10 px-3 py-3 bg-[#101822]">
        <div className="flex items-center justify-between gap-3 rounded-2xl px-3 py-2 panel">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSelfProfileOpen((current) => !current)}
              className="flex items-center justify-center"
              title="Профиль"
            >
              <div className="relative">
                <AvatarImage user={me} size={36} src={buildAvatarUrl?.(me)} className="flex-shrink-0" />
                <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#101822] ${currentStatus.color}`} />
              </div>
            </button>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate" style={meNameStyle}>
                {me?.displayName || me?.username || 'user'}
              </div>
              <div className="text-[11px] text-white/50 truncate">
                {profileStatus || currentStatus.label}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openSettings}
              className={`w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 transition ${view === 'settings' ? 'text-white' : 'text-white/70'}`}
              title="Профиль и настройки"
            >
              ⚙
            </button>
          </div>
        </div>
      </div>

      {addFriendOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-6" onClick={() => setAddFriendOpen(false)}>
          <div className="panel w-full max-w-md rounded-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <div className="text-lg font-semibold text-white/90">Добавить друга</div>
                <div className="text-xs text-white/60">Введите никнейм пользователя</div>
              </div>
              <button type="button" onClick={() => setAddFriendOpen(false)} className="text-white/40 hover:text-white/80 transition">
                x
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <input
                value={addFriendName}
                onChange={(e) => setAddFriendName(e.target.value)}
                placeholder="Никнейм"
                className="tg-input text-sm placeholder:text-white/40"
                disabled={friendBusy}
              />
              {friendError && <div className="text-xs text-red-300">{friendError}</div>}
            </div>
            <div className="px-5 py-4 border-t border-white/10 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setAddFriendOpen(false)}
                className="tg-button text-sm"
                disabled={friendBusy}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleAddFriend}
                className="tg-button tg-button--primary text-sm disabled:opacity-50"
                disabled={friendBusy}
              >
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}

      {selfProfileOpen && (
        <div
          className="absolute inset-0 z-40"
          onClick={() => {
            setSelfProfileOpen(false)
            setStatusMenuOpen(false)
          }}
        >
          <div
            className="absolute bottom-20 left-3 w-[320px] panel rounded-3xl overflow-visible shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className={`relative z-0 h-20 rounded-t-3xl overflow-hidden ${profileBackground ? 'bg-center bg-cover' : 'bg-gradient-to-r from-slate-900 to-slate-800'}`}
              style={profileBannerStyle}
            >
              {profileBackground && <div className="pointer-events-none absolute inset-0 z-0 bg-black/35" />}
            </div>
            <div className="relative z-10 px-4 pb-4 -mt-8 space-y-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <AvatarImage user={me} size={56} src={buildAvatarUrl?.(me)} className="flex-shrink-0 border border-white/10" />
                  <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-[#101822] ${currentStatus.color}`} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate" style={meNameStyle}>
                    {me?.displayName || me?.username || 'user'}
                  </div>
                  <div className="text-xs text-white/60 truncate">
                    {profileStatus || currentStatus.label}
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={openSettings}
                  className="tg-button text-sm w-full"
                >
                  Редактировать профиль
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setStatusMenuOpen((current) => !current)}
                    className="tg-button text-sm w-full flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${currentStatus.color}`} />
                      {currentStatus.label}
                    </span>
                    <span className="text-white/50">›</span>
                  </button>
                  {statusMenuOpen && (
                    <div className="absolute left-full top-0 ml-3 w-52 panel rounded-2xl overflow-hidden z-20">
                      {statusOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            setUserStatus(option.id)
                            setStatusMenuOpen(false)
                          }}
                          className="w-full px-4 py-2 text-sm flex items-center gap-3 hover:bg-white/10 transition"
                        >
                          <span className={`w-2.5 h-2.5 rounded-full ${option.color}`} />
                          <span>{option.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {createDialogOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-6" onClick={closeCreateDialog}>
          <div className="panel w-full max-w-lg rounded-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <div className="text-lg font-semibold text-white/90">Новая группа</div>
                <div className="text-xs text-white/60">Выберите название и друзей</div>
              </div>
              <button type="button" onClick={closeCreateDialog} className="text-white/40 hover:text-white/80 transition">
                x
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
                  className="tg-input text-sm placeholder:text-white/40"
                  placeholder="Например, Команда"
                  disabled={creating}
                />
              </div>
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.2em] text-white/40">Участники</div>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {friends.map((user) => {
                    const checked = selectedIds.includes(user.id)
                    return (
                      <label
                        key={user.id}
                        className="flex items-center justify-between gap-3 panel hover:bg-white/10 transition px-3 py-2 rounded-2xl"
                      >
                        <div className="flex items-center gap-3">
                          <AvatarImage user={user} size={28} src={buildAvatarUrl?.(user)} />
                          <div className="text-sm text-white/80" style={getUserNameStyle(user)}>
                            {user.displayName || user.username}
                          </div>
                        </div>
                        <input type="checkbox" checked={checked} onChange={() => toggleSelection(user.id)} disabled={creating} />
                      </label>
                    )
                  })}
                  {friends.length === 0 && <div className="text-sm text-white/40">Пока нет друзей</div>}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.2em] text-white/40">Аватар</div>
                <div className="flex items-center gap-3">
                  <AvatarImage
                    user={{ username: channelName || 'group' }}
                    size={48}
                    src={channelAvatarPreview || undefined}
                    fallback={channelName || 'Группа'}
                  />
                  <div className="flex flex-col gap-2 text-xs">
                    <label className="cursor-pointer tg-button text-xs">
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
              </div>
            </div>
            <div className="px-5 py-4 border-t border-white/10 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeCreateDialog}
                  className="tg-button text-sm"
                  disabled={creating}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleCreateGroup}
                  className="tg-button tg-button--primary text-sm disabled:opacity-40"
                  disabled={creating}
                >
                  {creating ? 'Создание...' : 'Создать'}
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
