import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useStore, { buildNameStyle } from '../state/store.js'
import AvatarImage from './AvatarImage.jsx'

function SmileIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  )
}

function SendIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

function TrashIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </svg>
  )
}

function EditIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  )
}

function ReplyIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 10 4 15 9 20" />
      <path d="M4 15h9a7 7 0 0 1 7 7" />
    </svg>
  )
}

function IconButton({ onClick, title, children, disabled, variant = 'ghost' }) {
  const base = 'w-10 h-10 flex items-center justify-center rounded-full transition-colors button-press pointer-auto no-drag'
  const style =
    variant === 'primary'
      ? ' bg-sky-400 text-slate-950 hover:bg-sky-300 disabled:bg-white/20 disabled:text-white/50'
      : ' bg-white/5 hover:bg-white/10 text-white/90 disabled:opacity-40'
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled} className={`${base} ${style}`}>
      {children}
    </button>
  )
}

const extractTextAndAttachments = (content) => {
  if (typeof content !== 'string') {
    return { textSegments: [content], attachments: [] }
  }
  return { textSegments: [content], attachments: [] }
}

const extractPeerIdFromChannel = (channelId, selfId) => {
  if (!channelId?.startsWith('dm:') || !selfId) return null
  const [, first, second] = channelId.split(':')
  if (!first || !second) return null
  if (first === selfId) return second
  if (second === selfId) return first
  return null
}

export default function Chat() {
  const activeChannelId = useStore((s) => s.activeChannelId)
  const channels = useStore((s) => s.channels)
  const messagesMap = useStore((s) => s.messages)
  const messages = activeChannelId ? messagesMap[activeChannelId] || [] : []
  const sendMessage = useStore((s) => s.sendMessage)
  const loadMore = useStore((s) => s.loadMore)
  const deleteMessage = useStore((s) => s.deleteMessage)
  const editMessage = useStore((s) => s.editMessage)
  const users = useStore((s) => s.users)
  const me = useStore((s) => s.user)
  const directPeers = useStore((s) => s.directPeers)
  const onlineUserIds = useStore((s) => s.onlineUserIds)
  const buildAvatarUrl = useStore((s) => s.buildAvatarUrl)
  const channelMembersMap = useStore((s) => s.channelMembers)
  const fetchChannelMembers = useStore((s) => s.fetchChannelMembers)
  const addChannelMember = useStore((s) => s.addChannelMember)
  const removeChannelMember = useStore((s) => s.removeChannelMember)
  const deleteChannel = useStore((s) => s.deleteChannel)
  const typingMap = useStore((s) => s.typing)
  const socket = useStore((s) => s.socket)

  const [text, setText] = useState('')
  const [deleteDialog, setDeleteDialog] = useState(null)
  const [editDialog, setEditDialog] = useState(null)
  const [replyTarget, setReplyTarget] = useState(null)
  const [membersDialogOpen, setMembersDialogOpen] = useState(false)
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState(null)
  const [channelDeleteState, setChannelDeleteState] = useState({ loading: false, error: null })
  const [selectedNewMembers, setSelectedNewMembers] = useState([])
  const [selfTyping, setSelfTyping] = useState(false)
  const [peerProfileOpen, setPeerProfileOpen] = useState(false)
  const listRef = useRef(null)
  const textareaRef = useRef(null)
  const prevChannelRef = useRef(null)
  const prevCountRef = useRef(0)
  const typingTimeoutRef = useRef(null)
  const selfTypingRef = useRef(false)
  const prevTypingChannelRef = useRef(null)
  const headerRef = useRef(null)

  const userMap = useMemo(() => {
    const map = new Map()
    users.forEach((user) => {
      if (user?.id) map.set(user.id, user)
    })
    return map
  }, [users])
  const onlineSet = useMemo(() => new Set(onlineUserIds), [onlineUserIds])
  const getUserNameStyle = (user) => buildNameStyle(user?.nameStyle)

  const currentChannel = channels.find((c) => c.id === activeChannelId)
  const hasActiveChannel = Boolean(activeChannelId)
  const isDirectChannel = activeChannelId?.startsWith('dm:')
  const directPeerId = useMemo(() => {
    if (!isDirectChannel) return null
    return directPeers[activeChannelId] || extractPeerIdFromChannel(activeChannelId, me?.id)
  }, [isDirectChannel, directPeers, activeChannelId, me?.id])
  const directPeer = directPeerId ? userMap.get(directPeerId) : null
  const directPeerOnline = directPeerId ? onlineSet.has(directPeerId) : false
  const directPeerStatusLabel = directPeerOnline ? 'В сети' : 'Оффлайн'
  const directPeerProfileStatus = directPeer?.profileStatus || ''
  const directPeerBackground = directPeer?.profileBackground || ''
  const directPeerBannerStyle = directPeerBackground ? { backgroundImage: `url(${directPeerBackground})` } : undefined
  const channelMembers = currentChannel?.id ? channelMembersMap[currentChannel.id] || [] : []
  const typingUsersRaw = useMemo(() => (activeChannelId ? typingMap[activeChannelId] || [] : []), [typingMap, activeChannelId])
  const typingUsers = useMemo(
    () => typingUsersRaw.filter((entry) => entry.userId !== me?.id),
    [typingUsersRaw, me?.id],
  )
  const typingLabelParts = useMemo(() => {
    if (!typingUsers.length) return null
    const entries = typingUsers.map((entry) => {
      const user = entry.userId ? userMap.get(entry.userId) : null
      const username = entry.username || user?.username || entry.userId
      const display = entry.displayName || user?.displayName || ''
      const label = display ? display : username?.startsWith('@') ? username : `@${username}`
      const style = buildNameStyle(entry.nameStyle || user?.nameStyle)
      return { label, style }
    })
    return entries
  }, [typingUsers, userMap])
  const deletePreviewText = useMemo(() => {
    if (!deleteDialog?.message) return ''
    const { textSegments, attachments } = extractTextAndAttachments(deleteDialog.message.content)
    const text = textSegments.join(' ').trim()
    if (text) return text
    if (attachments.length) {
      return `Вложений: ${attachments.length}`
    }
    return 'Без текста'
  }, [deleteDialog])
  const canManageMembers = Boolean(
    currentChannel?.isPrivate && (me?.role === 'admin' || ['owner', 'admin'].includes(currentChannel?.membershipRole || '')),
  )
  const canModerateChannel = Boolean(
    currentChannel &&
      (me?.role === 'admin' ||
        (currentChannel.isPrivate && ['owner', 'admin'].includes(currentChannel.membershipRole || ''))),
  )
  const availableMemberCandidates = useMemo(() => {
    if (!currentChannel?.id) return []
    const existing = new Set(channelMembers.map((entry) => entry.user.id))
    if (me?.id) existing.add(me.id)
    return users.filter((user) => !existing.has(user.id))
  }, [channelMembers, users, currentChannel?.id, me?.id])

  const deletingChannel = channelDeleteState.loading
  const membersBusy = membersLoading || deletingChannel

  useEffect(() => {
    setMembersDialogOpen(false)
    setMembersError(null)
    setSelectedNewMembers([])
    setMembersLoading(false)
    setChannelDeleteState({ loading: false, error: null })
  }, [activeChannelId])

  useEffect(() => {
    setSelectedNewMembers((current) => {
      const next = current.filter((userId) => availableMemberCandidates.some((candidate) => candidate.id === userId))
      // don't update state if nothing changed (avoid infinite loops when availableMemberCandidates has unstable identity)
      if (next.length === current.length && next.every((v, i) => v === current[i])) return current
      return next
    })
  }, [availableMemberCandidates])

  useEffect(() => {
    if (!membersDialogOpen || !currentChannel?.id || !currentChannel.isPrivate) return undefined
    let cancelled = false
    setMembersLoading(true)
    setMembersError(null)
    fetchChannelMembers(currentChannel.id)
      .catch((err) => {
        console.error('fetch members failed', err)
        if (!cancelled) setMembersError('Не удалось загрузить участников')
      })
      .finally(() => {
        if (!cancelled) setMembersLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [membersDialogOpen, currentChannel?.id, currentChannel?.isPrivate, fetchChannelMembers])

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const prevChannel = prevChannelRef.current
    const prevCount = prevCountRef.current
    const nearBottom = list.scrollHeight - (list.scrollTop + list.clientHeight) < 120
    if (prevChannel !== activeChannelId) {
      list.scrollTop = list.scrollHeight
    } else if (messages.length > prevCount && nearBottom) {
      list.scrollTop = list.scrollHeight
    }
    prevChannelRef.current = activeChannelId
    prevCountRef.current = messages.length
  }, [messages, activeChannelId])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [text])

  useEffect(() => {
    const previousChannel = prevTypingChannelRef.current
    if (previousChannel && previousChannel !== activeChannelId && socket && selfTypingRef.current) {
      socket.emit('typing', { channelId: previousChannel, state: false })
    }
    prevTypingChannelRef.current = activeChannelId
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = null
    }
    if (selfTypingRef.current) {
      selfTypingRef.current = false
      setSelfTyping(false)
    }
  }, [activeChannelId, socket])

  const stopTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = null
    }
    if (selfTypingRef.current) {
      if (socket && activeChannelId) {
        socket.emit('typing', { channelId: activeChannelId, state: false })
      }
      selfTypingRef.current = false
      setSelfTyping(false)
    }
  }, [activeChannelId, socket])

  const handleTextChange = useCallback(
    (value) => {
      setText(value)
      if (!socket || !activeChannelId) return
      const hasText = value.trim().length > 0
      if (!hasText) {
        stopTyping()
        return
      }
      if (!selfTypingRef.current) {
        socket.emit('typing', { channelId: activeChannelId, state: true })
        selfTypingRef.current = true
        setSelfTyping(true)
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = setTimeout(() => {
        if (!selfTypingRef.current) return
        socket.emit('typing', { channelId: activeChannelId, state: false })
        selfTypingRef.current = false
        setSelfTyping(false)
      }, 2000)
    },
    [activeChannelId, socket, stopTyping],
  )

  const handleInputBlur = useCallback(() => {
    stopTyping()
  }, [stopTyping])

  const handleSend = useCallback(() => {
    if (!text.trim()) return
    sendMessage(text, replyTarget?.id || null)
    setText('')
    setReplyTarget(null)
    stopTyping()
  }, [replyTarget?.id, sendMessage, stopTyping, text])

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const onScroll = (e) => {
    if (e.currentTarget.scrollTop === 0) loadMore()
  }

  const nameById = (id) => {
    const user = userMap.get(id)
    return user?.displayName || user?.username || 'user'
  }
  const summarizeMessage = useCallback((message) => {
    if (!message) return 'Без текста'
    const { textSegments, attachments } = extractTextAndAttachments(message.content)
    const text = textSegments.join(' ').trim()
    if (text) return text.length > 140 ? `${text.slice(0, 137)}...` : text
    if (attachments.length === 1) return 'Вложение'
    if (attachments.length > 1) return `Вложения (${attachments.length})`
    return 'Без текста'
  }, [])

  const handleSelectReply = useCallback(
    (message) => {
      if (!message) return
      setReplyTarget({
        id: message.id,
        authorId: message.senderId,
        author: nameById(message.senderId),
        preview: summarizeMessage(message),
      })
      textareaRef.current?.focus()
    },
    [nameById, summarizeMessage],
  )

  const clearReplyTarget = useCallback(() => {
    setReplyTarget(null)
    textareaRef.current?.focus()
  }, [])

  const avatarSrcById = (id) => {
    const user = userMap.get(id)
    return user ? buildAvatarUrl?.(user) : null
  }

  const canRemoveMemberEntry = (entry) => {
    if (!canManageMembers) return false
    if (me?.role === 'admin') return true
    if (entry.role === 'owner') return false
    if (currentChannel?.membershipRole === 'owner') return true
    if (currentChannel?.membershipRole === 'admin') {
      return entry.role === 'member'
    }
    return false
  }

  const handleSelectedMemberToggle = (userId) => {
    if (membersBusy) return
    setSelectedNewMembers((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]))
  }

  const handleAddMembers = async () => {
    if (!currentChannel?.id || !selectedNewMembers.length || deletingChannel) return
    setMembersLoading(true)
    setMembersError(null)
    try {
      for (const userId of selectedNewMembers) {
        // eslint-disable-next-line no-await-in-loop
        await addChannelMember(currentChannel.id, userId)
      }
      setSelectedNewMembers([])
    } catch (err) {
      console.error('add member failed', err)
      setMembersError('Не удалось добавить участника')
    } finally {
      setMembersLoading(false)
    }
  }

  const handleRemoveMember = async (userId) => {
    if (!currentChannel?.id || deletingChannel) return
    setMembersLoading(true)
    setMembersError(null)
    try {
      await removeChannelMember(currentChannel.id, userId)
      if (userId === me?.id) {
        setMembersDialogOpen(false)
      }
    } catch (err) {
      console.error('remove member failed', err)
      setMembersError('Не удалось удалить участника')
    } finally {
      setMembersLoading(false)
    }
  }

  const handleDeleteChannel = async () => {
    if (!currentChannel?.id) return
    const confirmation = window.confirm(`Удалить канал #${currentChannel.name}? Это действие нельзя отменить.`)
    if (!confirmation) return
    setChannelDeleteState({ loading: true, error: null })
    try {
      await deleteChannel(currentChannel.id)
      setChannelDeleteState({ loading: false, error: null })
      setMembersDialogOpen(false)
      setMembersError(null)
      setSelectedNewMembers([])
      setMembersLoading(false)
    } catch (err) {
      console.error('delete channel failed', err)
      setChannelDeleteState({ loading: false, error: 'Не удалось удалить канал' })
    }
  }

  const handleRequestDelete = (message) => {
    setDeleteDialog({ message, loading: false, error: null })
  }

  const confirmDeleteMessage = async () => {
    if (!deleteDialog?.message) return
    setDeleteDialog((state) => (state ? { ...state, loading: true, error: null } : state))
    try {
      await deleteMessage(deleteDialog.message.id)
      setDeleteDialog(null)
    } catch (err) {
      console.error(err)
      setDeleteDialog((state) => (state ? { ...state, loading: false, error: 'Не удалось удалить сообщение' } : state))
    }
  }

  const handleRequestEdit = (message) => {
    setEditDialog({ message, value: message.content, loading: false, error: null })
  }

  const confirmEditMessage = async () => {
    if (!editDialog?.message) return
    const value = editDialog.value || ''
    if (!value.trim()) {
      setEditDialog((state) => (state ? { ...state, error: 'Введите текст сообщения' } : state))
      return
    }
    setEditDialog((state) => (state ? { ...state, loading: true, error: null } : state))
    try {
      await editMessage(editDialog.message.id, editDialog.message.channelId, value)
      setEditDialog(null)
    } catch (err) {
      console.error(err)
      setEditDialog((state) => (state ? { ...state, loading: false, error: 'Не удалось сохранить изменения' } : state))
    }
  }

  const closeDeleteDialog = () => {
    if (deleteDialog?.loading) return
    setDeleteDialog(null)
  }

  const closeEditDialog = () => {
    if (editDialog?.loading) return
    setEditDialog(null)
  }

  const openMembersDialog = () => {
    if (!currentChannel?.id) return
    setMembersDialogOpen(true)
    setMembersError(null)
    setChannelDeleteState({ loading: false, error: null })
    setSelectedNewMembers([])
  }

  const closeMembersDialog = () => {
    if (membersBusy) return
    setMembersDialogOpen(false)
    setMembersError(null)
    setSelectedNewMembers([])
    setMembersLoading(false)
    setChannelDeleteState({ loading: false, error: null })
  }

  const directPeerLabel = directPeer
    ? (directPeer.displayName || directPeer.username || '').trim()
    : ''
  const headerTitle = isDirectChannel
    ? directPeerLabel || 'Личный чат'
    : currentChannel ? `#${currentChannel.name}` : 'Выберите чат'
  const headerSubtitle = isDirectChannel
    ? 'Личный диалог'
    : currentChannel ? 'Групповой чат' : ''
  const replyTargetAuthorName = replyTarget?.author || (replyTarget?.authorId ? nameById(replyTarget.authorId) : null)
  const replyTargetAuthorLabel = replyTargetAuthorName ? replyTargetAuthorName.replace(/^@/, '') : 'user'
  const replyTargetPreviewText = replyTarget?.preview || 'Без текста'

  useEffect(() => {
    if (!peerProfileOpen) return undefined
    const handleKey = (event) => {
      if (event.key === 'Escape') setPeerProfileOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [peerProfileOpen])

  return (
    <div className="flex-1 flex flex-col h-full relative">
      <div className="panel px-6 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="relative" ref={headerRef}>
            {isDirectChannel ? (
              <button
                type="button"
                onClick={() => setPeerProfileOpen((current) => !current)}
                className="text-left"
              >
                <div className="text-sm font-medium" style={getUserNameStyle(directPeer)}>
                  {headerTitle}
                </div>
                <div className="text-xs text-white/60">{headerSubtitle}</div>
              </button>
            ) : (
              <div>
                <div className="text-sm font-medium">{headerTitle}</div>
                <div className="text-xs text-white/60">{headerSubtitle}</div>
              </div>
            )}
          </div>
        <div className="flex items-center gap-3">
          {canManageMembers && currentChannel && (
            <button
              type="button"
              onClick={openMembersDialog}
              className="tg-button text-xs"
            >
              Участники
            </button>
          )}
        </div>
      </div>

      {peerProfileOpen && isDirectChannel && directPeer && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-6"
          onClick={() => setPeerProfileOpen(false)}
        >
          <div
            className="w-full max-w-sm panel rounded-3xl overflow-visible shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className={`relative z-0 h-24 rounded-t-3xl overflow-hidden ${directPeerBackground ? 'bg-center bg-cover' : 'bg-gradient-to-r from-slate-900 to-slate-800'}`}
              style={directPeerBannerStyle}
            >
              {directPeerBackground && <div className="absolute inset-0 z-0 bg-black/35" />}
            </div>
            <div className="relative z-10 px-4 pb-4 -mt-10 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative">
                    <AvatarImage user={directPeer} size={56} src={buildAvatarUrl?.(directPeer)} />
                    <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-[#101822] ${directPeerOnline ? 'bg-emerald-400' : 'bg-white/30'}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate" style={getUserNameStyle(directPeer)}>
                      {directPeer.displayName || directPeer.username}
                    </div>
                    {directPeerProfileStatus && (
                      <div className="text-xs text-white/70 truncate">{directPeerProfileStatus}</div>
                    )}
                    <div className="text-[11px] text-white/50 truncate">{directPeerStatusLabel}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPeerProfileOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 transition"
                  title="Закрыть"
                >
                  x
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-6 space-y-3 scroll-thin">
        {messages.map((m) => {
          const mine = m.senderId === me?.id
          const author = userMap.get(m.senderId)
          const { textSegments } = extractTextAndAttachments(m.content)
          const avatarSrc = avatarSrcById(m.senderId)
          const canDelete = mine || me?.role === 'admin' || canModerateChannel
          const canEdit = mine || canModerateChannel
          const edited = m.updatedAt && m.updatedAt > (m.createdAt || 0)
          const replyInfo = m.replyTo || null
          const replyAuthorRaw = replyInfo?.author || (replyInfo?.authorId ? nameById(replyInfo.authorId) : null)
          const replyAuthorLabel = replyAuthorRaw
            ? replyAuthorRaw.startsWith('@')
              ? replyAuthorRaw
              : `@${replyAuthorRaw}`
            : '@user'
          const replyAuthorUser = replyInfo?.authorId ? userMap.get(replyInfo.authorId) : null
          const replyAuthorDisplay = replyAuthorUser?.displayName || replyAuthorLabel.replace(/^@/, '')
          const replyAuthorStyle = buildNameStyle(replyAuthorUser?.nameStyle)
          const replyPreviewText = replyInfo
            ? replyInfo.preview || (replyInfo.missing ? 'Сообщение недоступно' : 'Без текста')
            : ''
          const authorStyle = buildNameStyle(author?.nameStyle)
          return (
            <div key={m.id} className={`tg-bubble ${mine ? 'tg-bubble--mine ml-auto' : ''}`}>
              <div className="flex items-center justify-between text-[11px] text-white/70 mb-2">
                <div className="flex items-center gap-2">
                  <AvatarImage user={author} size={28} src={avatarSrc} />
                  <span style={authorStyle}>
                    {author?.displayName || nameById(m.senderId).replace(/^@/, '')}
                  </span>
                  <span className="opacity-60">
                    {new Date(m.createdAt || m.created_at).toLocaleTimeString()}
                    {edited ? ' · изменено' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-white/40">
                  <button
                    type="button"
                    className="text-xs uppercase tracking-[0.12em] hover:text-white transition"
                    onClick={() => handleSelectReply(m)}
                    title="Ответить"
                    aria-label="Ответить"
                  >
                    <ReplyIcon />
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      className="hover:text-white transition"
                      onClick={() => handleRequestEdit(m)}
                    >
                      <EditIcon />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      className="hover:text-red-400 transition"
                      onClick={() => handleRequestDelete(m)}
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              </div>
              <div className="whitespace-pre-wrap leading-relaxed break-words space-y-3">
                {replyInfo && (
                  <div className="px-3 py-2 rounded-2xl bg-white/5 border border-white/10">
                    <div className="text-xs text-white/50 mb-1">
                      Ответ{' '}
                      <span style={replyAuthorStyle}>{replyAuthorDisplay}</span>
                    </div>
                    <div className="text-sm text-white/80 whitespace-pre-wrap break-words">
                      {replyPreviewText}
                    </div>
                  </div>
                )}
                {textSegments.filter((segment) => segment && segment.trim()).map((segment, idx) => (
                  <div key={`text-${m.id}-${idx}`}>{segment}</div>
                ))}
              </div>
            </div>
          )
        })}
        {messages.length === 0 && (
          <div className="text-sm text-white/40 text-center py-10">
            {hasActiveChannel ? 'Сообщений пока нет' : 'Выберите чат'}
          </div>
        )}
      </div>

      {hasActiveChannel && (selfTyping || typingLabelParts?.length) && (
        <div className="px-6 pb-2 text-xs text-white/60 italic">
          {selfTyping && <span>Вы печатаете...</span>}
          {selfTyping && typingLabelParts?.length ? ' ' : null}
          {typingLabelParts?.length ? (
            typingLabelParts.length === 1 ? (
              <>
                <span style={typingLabelParts[0].style}>{typingLabelParts[0].label}</span> печатает...
              </>
            ) : typingLabelParts.length === 2 ? (
              <>
                <span style={typingLabelParts[0].style}>{typingLabelParts[0].label}</span> и{' '}
                <span style={typingLabelParts[1].style}>{typingLabelParts[1].label}</span> печатают...
              </>
            ) : typingLabelParts.length === 3 ? (
              <>
                <span style={typingLabelParts[0].style}>{typingLabelParts[0].label}</span>,{' '}
                <span style={typingLabelParts[1].style}>{typingLabelParts[1].label}</span> и{' '}
                <span style={typingLabelParts[2].style}>{typingLabelParts[2].label}</span> печатают...
              </>
            ) : (
              <>
                <span style={typingLabelParts[0].style}>{typingLabelParts[0].label}</span>,{' '}
                <span style={typingLabelParts[1].style}>{typingLabelParts[1].label}</span> и еще{' '}
                {typingLabelParts.length - 2} печатают...
              </>
            )
          ) : null}
        </div>
      )}

      {hasActiveChannel && (
        <div className="px-6 py-4 border-t border-white/10">
        {replyTarget && (
          <div className="mb-3 px-4 py-3 rounded-2xl bg-white/10 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-white/60 uppercase tracking-[0.15em] mb-1">Ответ {replyTargetAuthorLabel}</div>
              <div className="text-sm text-white/80 whitespace-pre-wrap break-words max-h-24 overflow-hidden">
                {replyTargetPreviewText}
              </div>
            </div>
            <button
              type="button"
              onClick={clearReplyTarget}
              className="text-white/60 hover:text-white transition"
              title="Отменить ответ"
            >
              ✕
            </button>
          </div>
        )}
        <div className="panel rounded-2xl px-4 py-2 flex items-center gap-3">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleInputBlur}
            placeholder="Напишите сообщение..."
            className="flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/40 outline-none border-none resize-none max-h-36"
            style={{ marginTop: '-10px' }}
            rows={1}
          />
          <div className="flex items-center gap-2 pb-1">
            <IconButton onClick={() => {}} title="Смайлы" disabled>
              <SmileIcon />
            </IconButton>
            <IconButton onClick={() => handleSend()} title="Отправить" disabled={!text.trim()} variant="primary">
              <SendIcon className="w-5 h-5" />
            </IconButton>
          </div>
        </div>
      </div>
      )}
      {deleteDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-6"
          onClick={closeDeleteDialog}
        >
          <div className="panel w-full max-w-md rounded-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/10">
              <div className="text-lg font-semibold text-white/90">Удалить сообщение?</div>
              <div className="text-xs text-white/60 mt-1">Действие нельзя отменить.</div>
            </div>
            {deleteDialog.error && <div className="px-5 py-3 text-sm text-red-300 bg-red-500/10">{deleteDialog.error}</div>}
            <div className="px-5 py-4 space-y-3">
              {deleteDialog.message && (
                <div className="panel rounded-2xl px-4 py-3 space-y-2">
                  <div className="text-xs text-white/50 uppercase tracking-[0.2em]">Сообщение</div>
                  <div className="text-sm text-white/80 whitespace-pre-wrap break-words">{deletePreviewText}</div>
                  <div className="text-xs text-white/40">
                    <span style={buildNameStyle(userMap.get(deleteDialog.message.senderId)?.nameStyle)}>
                      {userMap.get(deleteDialog.message.senderId)?.displayName || nameById(deleteDialog.message.senderId).replace(/^@/, '')}
                    </span>{' '}
                    ·{' '}
                    {new Date(deleteDialog.message.createdAt || deleteDialog.message.created_at || Date.now()).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-white/10 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeDeleteDialog}
                className="tg-button text-sm"
                disabled={deleteDialog.loading}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={confirmDeleteMessage}
                className="px-4 py-2 rounded-2xl bg-red-500/80 hover:bg-red-500 transition text-sm text-white disabled:opacity-60"
                disabled={deleteDialog.loading}
              >
                {deleteDialog.loading ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
      {editDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-6"
          onClick={closeEditDialog}
        >
          <div className="panel w-full max-w-lg rounded-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <div className="text-lg font-semibold text-white/90">Редактирование сообщения</div>
                {editDialog.message && (
                  <div className="text-xs text-white/60 mt-1" style={buildNameStyle(userMap.get(editDialog.message.senderId)?.nameStyle)}>
                    {userMap.get(editDialog.message.senderId)?.displayName || nameById(editDialog.message.senderId).replace(/^@/, '')}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={closeEditDialog}
                className="text-white/40 hover:text-white/80 transition"
                disabled={editDialog.loading}
              >
                ✕
              </button>
            </div>
            {editDialog.error && <div className="px-5 py-3 text-sm text-red-300 bg-red-500/10">{editDialog.error}</div>}
            <div className="px-5 py-4 space-y-4">
              <textarea
                value={editDialog.value}
                onChange={(e) =>
                  setEditDialog((state) => (state ? { ...state, value: e.target.value } : state))
                }
                rows={5}
                className="tg-input resize-none text-sm placeholder:text-white/40"
                placeholder="Введите сообщение"
                disabled={editDialog.loading}
              />
              <div className="text-xs text-white/40">
                Изменённое сообщение увидят все участники чата.
              </div>
            </div>
            <div className="px-5 py-4 border-t border-white/10 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeEditDialog}
                className="tg-button text-sm"
                disabled={editDialog.loading}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={confirmEditMessage}
                className="tg-button tg-button--primary text-sm disabled:opacity-50"
                disabled={editDialog.loading}
              >
                {editDialog.loading ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
      {membersDialogOpen && currentChannel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-6"
          onClick={closeMembersDialog}
        >
          <div className="panel w-full max-w-3xl rounded-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div>
                <div className="text-lg font-semibold text-white/90">Участники #{currentChannel.name}</div>
                <div className="text-xs text-white/60 mt-1">Управление доступом к приватной комнате</div>
              </div>
              <button
                type="button"
                onClick={closeMembersDialog}
                className="text-white/40 hover:text-white/80 transition"
                disabled={membersBusy}
              >
                ✕
              </button>
            </div>
            {membersError && <div className="px-6 py-3 text-sm text-red-300 bg-red-500/10">{membersError}</div>}
            {channelDeleteState.error && (
              <div className="px-6 py-3 text-sm text-red-300 bg-red-500/10">{channelDeleteState.error}</div>
            )}
            <div className="px-6 py-4 space-y-6 max-h-[70vh] overflow-y-auto scroll-thin">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-white/40 mb-2">Текущие участники</div>
                {membersLoading && channelMembers.length === 0 ? (
                  <div className="text-sm text-white/50 py-4">Загрузка участников...</div>
                ) : channelMembers.length ? (
                  <div className="space-y-2">
                    {channelMembers.map((entry) => (
                      <div
                        key={entry.user.id}
                        className="flex items-center justify-between gap-3 panel px-3 py-2 rounded-2xl"
                      >
                        <div className="flex items-center gap-3">
                          <AvatarImage user={entry.user} size={32} src={buildAvatarUrl?.(entry.user)} />
                            <div>
                            <div className="text-sm text-white/90" style={getUserNameStyle(entry.user)}>
                              {entry.user.displayName || entry.user.username}
                            </div>
                            <div className="text-[11px] text-white/40">
                              {entry.role === 'owner'
                                ? 'Создатель'
                                : entry.role === 'admin'
                                ? 'Админ'
                                : 'Участник'}
                            </div>
                          </div>
                        </div>
                        {canRemoveMemberEntry(entry) && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(entry.user.id)}
                            className="text-xs text-red-300 hover:text-red-200 transition"
                            disabled={membersBusy}
                          >
                            Удалить
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-white/50 py-4">Участников пока нет</div>
                )}
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-white/40 mb-2">Добавить участников</div>
                {availableMemberCandidates.length ? (
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {availableMemberCandidates.map((user) => {
                      const checked = selectedNewMembers.includes(user.id)
                      return (
                        <label
                          key={user.id}
                          className="flex items-center justify-between gap-3 panel px-3 py-2 rounded-2xl cursor-pointer hover:bg-white/10 transition"
                        >
                          <div className="flex items-center gap-3">
                            <AvatarImage user={user} size={28} src={buildAvatarUrl?.(user)} />
                            <div className="text-sm text-white/80" style={getUserNameStyle(user)}>
                              {user.displayName || user.username}
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleSelectedMemberToggle(user.id)}
                            disabled={membersBusy}
                          />
                        </label>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-white/50 py-2">Нет доступных пользователей</div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {canModerateChannel && (
                  <button
                    type="button"
                    onClick={handleDeleteChannel}
                    className="px-4 py-2 rounded-2xl bg-red-500/80 text-white hover:bg-red-500 transition text-sm disabled:opacity-50"
                    disabled={membersBusy}
                  >
                    {deletingChannel ? 'Удаление...' : 'Удалить канал'}
                  </button>
                )}
                <div className="text-xs text-white/40">
                  {deletingChannel
                    ? 'Удаление канала...'
                    : membersLoading
                    ? 'Обновление списка...'
                    : selectedNewMembers.length
                    ? `${selectedNewMembers.length} выбран(о)`
                    : ''}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={closeMembersDialog}
                  className="tg-button text-sm"
                  disabled={membersBusy}
                >
                  Закрыть
                </button>
                <button
                  type="button"
                  onClick={handleAddMembers}
                  className="tg-button tg-button--primary text-sm disabled:opacity-50"
                  disabled={membersBusy || selectedNewMembers.length === 0}
                >
                  {membersLoading ? 'Сохранение...' : 'Добавить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}










