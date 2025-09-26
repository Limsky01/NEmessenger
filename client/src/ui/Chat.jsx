import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useStore from '../state/store.js'
import AvatarImage from './AvatarImage.jsx'

function PaperclipIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a4.5 4.5 0 01-6.36-6.36l9.19-9.19a3 3 0 014.24 4.24l-9.19 9.19a1.5 1.5 0 01-2.12-2.12l8.48-8.49" />
    </svg>
  )
}

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

function PlayIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4.5v15l12-7.5-12-7.5z" />
    </svg>
  )
}

function PauseIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="5" y="4" width="5" height="16" rx="1" />
      <rect x="14" y="4" width="5" height="16" rx="1" />
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

function IconButton({ onClick, title, children, disabled, variant = 'ghost' }) {
  const base = 'w-10 h-10 flex items-center justify-center rounded-full transition-colors button-press pointer-auto no-drag'
  const style =
    variant === 'primary'
      ? ' bg-white/80 text-black hover:bg-white disabled:bg-white/30 disabled:text-white/40'
      : ' bg-white/5 hover:bg-white/10 text-white/90 disabled:opacity-40'
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled} className={`${base} ${style}`}>
      {children}
    </button>
  )
}

const attachmentPattern = /\[file:([^\]]+)\]/g

const parseAttachmentToken = (token) => {
  if (!token) return null
  const parts = token.split(':')
  const id = parts.shift()
  if (!id) return null
  const name = parts.join(':') || `file-${id}`
  return { id, name }
}

const isTokenLikelyImage = (token) => {
  const name = token?.name || ''
  const mime = token?.mime || ''
  const byMime = typeof mime === 'string' && mime.startsWith('image/')
  const byExt = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)
  return byMime || byExt
}

const defaultUploadOptions = { group: false, compress: false, remember: false, comment: '' }

const readStoredUploadOptions = () => {
  try {
    const raw = localStorage.getItem('uploadOptions')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return {
        group: Boolean(parsed.group),
        compress: Boolean(parsed.compress),
        remember: true,
      }
    }
  } catch (err) {
    console.warn('upload options restore failed', err)
  }
  return null
}

const compressImageFile = async (file, maxDimension = 1920) => {
  if (!file?.type?.startsWith('image/')) return file
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = reject
      image.src = url
    })
    const largestSide = Math.max(img.width, img.height)
    if (!largestSide || largestSide <= maxDimension) return file
    const scale = maxDimension / largestSide
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    const ctx = canvas.getContext('2d', { alpha: true })
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const isPng = file.type === 'image/png'
    const outputType = isPng ? 'image/png' : 'image/jpeg'
    const quality = isPng ? undefined : 0.85
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, outputType, quality))
    if (!blob) return file
    return new File([blob], file.name, { type: blob.type, lastModified: Date.now() })
  } catch (err) {
    console.error('compressImageFile failed', err)
    return file
  } finally {
    URL.revokeObjectURL(url)
  }
}

const useAttachmentMeta = (token) => {
  const meta = useStore((s) => (token?.id ? s.files[token.id] : null))
  const ensureFileMeta = useStore((s) => s.ensureFileMeta)
  const buildFileUrl = useStore((s) => s.buildFileUrl)

  useEffect(() => {
    if (!token?.id || meta) return
    ensureFileMeta(token.id).catch((err) => console.error('file meta load failed', err))
  }, [token?.id, meta, ensureFileMeta])

  const resolved = meta || token
  const fileName = resolved?.name || token?.name || 'файл'
  const mime = (resolved?.mime || '').toLowerCase()
  const isImage = isTokenLikelyImage({ name: fileName, mime })
  const isAudio = mime.startsWith('audio/') || /\.(mp3|wav|ogg)$/i.test(fileName)
  const inlineUrl = token?.id ? buildFileUrl?.(token.id, { inline: true }) : null
  return { fileName, mime, isImage, isAudio, inlineUrl }
}

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const formatFileSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 Б'
  const units = ['Б', 'КБ', 'МБ', 'ГБ']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[unitIndex]}`
}

const guessFileGlyph = (file) => {
  const name = file?.name?.toLowerCase() || ''
  const type = file?.type?.toLowerCase() || ''
  if (type.startsWith('audio/')) return '🎵'
  if (type.startsWith('video/')) return '🎬'
  if (type.startsWith('image/')) return '🖼️'
  if (type === 'application/pdf' || name.endsWith('.pdf')) return '📄'
  if (/\.(zip|rar|7z|tar|gz)$/i.test(name)) return '🗜️'
  if (/\.(docx?|odt)$/i.test(name)) return '📝'
  if (/\.(pptx?|pps)$/i.test(name)) return '📊'
  if (/\.(xlsx?|ods)$/i.test(name)) return '📈'
  return '📎'
}

const guessFileDescriptor = (file) => {
  const type = file?.type || ''
  if (type.startsWith('image/')) return 'Изображение'
  if (type.startsWith('audio/')) return 'Аудио'
  if (type.startsWith('video/')) return 'Видео'
  if (type === 'application/pdf') return 'PDF-документ'
  if (type.includes('zip') || type.includes('rar')) return 'Архив'
  const ext = file?.name?.split('.')?.pop()?.toUpperCase() || ''
  return ext ? `${ext}-файл` : 'Файл'
}

function AudioAttachment({ token, openFile }) {
  const { fileName, inlineUrl } = useAttachmentMeta(token)
  const audioOutputDeviceId = useStore((s) => s.audioOutputDeviceId)
  const audioRef = useRef(null)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [loading, setLoading] = useState(true)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const element = audioRef.current
    if (!element) return undefined

    const handleLoaded = () => {
      setDuration(Number.isFinite(element.duration) ? element.duration : 0)
      setLoading(false)
    }
    const handleTime = () => setCurrentTime(element.currentTime || 0)
    const handlePlay = () => setPlaying(true)
    const handlePause = () => setPlaying(false)
    const handleWaiting = () => setLoading(true)
    const handlePlaying = () => setLoading(false)
    const handleEnded = () => {
      setPlaying(false)
      setCurrentTime(Number.isFinite(element.duration) ? element.duration : 0)
    }

    element.addEventListener('loadedmetadata', handleLoaded)
    element.addEventListener('timeupdate', handleTime)
    element.addEventListener('play', handlePlay)
    element.addEventListener('pause', handlePause)
    element.addEventListener('waiting', handleWaiting)
    element.addEventListener('playing', handlePlaying)
    element.addEventListener('ended', handleEnded)

    return () => {
      element.removeEventListener('loadedmetadata', handleLoaded)
      element.removeEventListener('timeupdate', handleTime)
      element.removeEventListener('play', handlePlay)
      element.removeEventListener('pause', handlePause)
      element.removeEventListener('waiting', handleWaiting)
      element.removeEventListener('playing', handlePlaying)
      element.removeEventListener('ended', handleEnded)
    }
  }, [])

  useEffect(() => {
    const element = audioRef.current
    if (!element) return
    setLoading(true)
    setDuration(0)
    setCurrentTime(0)
    if (inlineUrl) {
      if (element.src !== inlineUrl) {
        element.src = inlineUrl
      }
      element.load()
    } else {
      element.removeAttribute('src')
    }
  }, [inlineUrl])

  useEffect(() => {
    if (!inlineUrl) return
    const element = audioRef.current
    if (!element) return
    if (typeof element.setSinkId === 'function') {
      const sinkId = audioOutputDeviceId || 'default'
      element.setSinkId(sinkId).catch((err) => console.warn('setSinkId failed', err))
    }
  }, [inlineUrl, audioOutputDeviceId])

  useEffect(
    () => () => {
      const element = audioRef.current
      if (element) element.pause()
    },
    [],
  )

  const handleToggle = () => {
    const element = audioRef.current
    if (!element || !inlineUrl) return
    if (playing) {
      element.pause()
    } else {
      element.play().catch((err) => {
        console.warn('audio play failed', err)
      })
    }
  }

  const handleSeek = (event) => {
    const element = audioRef.current
    if (!element) return
    const value = Number(event.target.value)
    if (Number.isFinite(value)) {
      element.currentTime = Math.max(0, Math.min(value, element.duration || value))
    }
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="glass rounded-3xl px-4 py-3 text-white/80">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleToggle}
          disabled={!inlineUrl}
          className="w-11 h-11 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition disabled:opacity-50"
        >
          {playing ? <PauseIcon className="w-4 h-4 text-black" /> : <PlayIcon className="w-4 h-4 text-black" />}
        </button>
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-sm">{fileName}</span>
            <span className="text-xs text-white/50 whitespace-nowrap">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-white/70" style={{ width: `${progress}%` }} />
              <input
                type="range"
                min="0"
                max={duration || 0}
                step="0.1"
                value={Math.min(currentTime, duration || currentTime)}
                onChange={handleSeek}
                disabled={!inlineUrl || duration <= 0}
                className="absolute inset-0 w-full opacity-0 cursor-pointer"
                aria-label="Перемотка аудио"
              />
            </div>
            <button
              type="button"
              onClick={() => openFile(token.id, fileName)}
              className="px-3 py-1.5 rounded-2xl bg-white/10 hover:bg-white/20 transition text-xs"
            >
              Скачать
            </button>
          </div>
          {loading && inlineUrl && <div className="text-[11px] text-white/40">Буферизация...</div>}
          {!inlineUrl && <div className="text-[11px] text-white/40">Загрузка аудио...</div>}
        </div>
      </div>
      <audio ref={audioRef} preload="metadata" className="hidden" />
    </div>
  )
}

function FileAttachment({ token, openFile }) {
  const meta = useAttachmentMeta(token)

  if (meta.isAudio) {
    return <AudioAttachment token={token} openFile={openFile} />
  }

  return (
    <button
      type="button"
      onClick={() => openFile(token.id, meta.fileName)}
      className="underline flex items-center gap-2 text-left"
    >
      <PaperclipIcon className="w-4 h-4" />
      <span>{meta.fileName}</span>
    </button>
  )
}

function ImageAttachment({ token, openFile, onPreview, style, index = 0, siblings = [] }) {
  const { fileName, inlineUrl } = useAttachmentMeta(token)
  const handleClick = () => {
    if (onPreview) {
      onPreview({ id: token.id, name: fileName, index, siblings })
      return
    }
    openFile(token.id, fileName)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onDoubleClick={() => openFile(token.id, fileName)}
      className="relative block overflow-hidden rounded-3xl focus:outline-none focus:ring-2 focus:ring-white/50 bg-black/40"
      style={{ ...style, position: 'relative' }}
    >
      {inlineUrl ? (
        <img src={inlineUrl} alt={fileName} className="absolute inset-0 w-full h-full object-contain" />
      ) : (
        <div className="absolute inset-0 w-full h-full bg-white/5 animate-pulse" />
      )}
    </button>
  )
}

function buildGalleryLayout(count) {
  if (count <= 1) {
    return {
      container: { display: 'grid', gap: '12px' },
      item: () => ({ width: '100%', aspectRatio: '4 / 3' }),
    }
  }

  if (count === 2) {
    return {
      container: { display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
      item: () => ({ aspectRatio: '4 / 3' }),
    }
  }

  if (count === 3) {
    return {
      container: { display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
      item: (index) =>
        index === 0
          ? { gridColumn: 'span 2', aspectRatio: '3 / 2' }
          : { aspectRatio: '1 / 1' },
    }
  }

  if (count === 4) {
    return {
      container: { display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
      item: () => ({ aspectRatio: '1 / 1' }),
    }
  }

  return {
    container: { display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' },
    item: (index) => {
      if (index === 0) return { gridColumn: 'span 2', aspectRatio: '3 / 2' }
      if (index === 1) return { gridRow: 'span 2', aspectRatio: '3 / 4' }
      return { aspectRatio: '1 / 1' }
    },
  }
}

function ImageGallery({ tokens, openFile, onPreview }) {
  const count = tokens.length
  if (count === 0) return null
  const { container, item } = buildGalleryLayout(count)
  const siblingList = tokens.map((entry) => ({ id: entry.id, name: entry.name }))

  return (
    <div className="w-full" style={container}>
      {tokens.map((token, index) => (
        <ImageAttachment
          key={`img-${token.id}-${index}`}
          token={token}
          openFile={openFile}
          onPreview={onPreview}
          index={index}
          siblings={siblingList}
          style={item(index)}
        />
      ))}
    </div>
  )
}

const extractTextAndAttachments = (content) => {
  if (typeof content !== 'string') {
    return { textSegments: [content], attachments: [] }
  }
  const attachments = []
  const textSegments = []
  let lastIndex = 0
  for (const match of content.matchAll(attachmentPattern)) {
    const start = match.index ?? 0
    if (start > lastIndex) {
      textSegments.push(content.slice(lastIndex, start))
    }
    const attachment = parseAttachmentToken(match[1])
    if (attachment) attachments.push(attachment)
    lastIndex = start + match[0].length
  }
  if (lastIndex < content.length) {
    textSegments.push(content.slice(lastIndex))
  }
  return { textSegments, attachments }
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
  const uploadFile = useStore((s) => s.uploadFile)
  const directPeers = useStore((s) => s.directPeers)
  const buildAvatarUrl = useStore((s) => s.buildAvatarUrl)
  const buildFileUrl = useStore((s) => s.buildFileUrl)
  const ensureFileMeta = useStore((s) => s.ensureFileMeta)
  const files = useStore((s) => s.files)
  const channelMembersMap = useStore((s) => s.channelMembers)
  const fetchChannelMembers = useStore((s) => s.fetchChannelMembers)
  const addChannelMember = useStore((s) => s.addChannelMember)
  const removeChannelMember = useStore((s) => s.removeChannelMember)
  const deleteChannel = useStore((s) => s.deleteChannel)
  const typingMap = useStore((s) => s.typing)
  const socket = useStore((s) => s.socket)

  const [text, setText] = useState('')
  const [uploadState, setUploadState] = useState(null)
  const [deleteDialog, setDeleteDialog] = useState(null)
  const [editDialog, setEditDialog] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [uploadDialog, setUploadDialog] = useState(null)
  const [membersDialogOpen, setMembersDialogOpen] = useState(false)
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState(null)
  const [channelDeleteState, setChannelDeleteState] = useState({ loading: false, error: null })
  const [selectedNewMembers, setSelectedNewMembers] = useState([])
  const [selfTyping, setSelfTyping] = useState(false)
  const listRef = useRef(null)
  const fileInputRef = useRef(null)
  const textareaRef = useRef(null)
  const prevChannelRef = useRef(null)
  const prevCountRef = useRef(0)
  const uploadDialogRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const selfTypingRef = useRef(false)
  const prevTypingChannelRef = useRef(null)

  const userMap = useMemo(() => {
    const map = new Map()
    users.forEach((user) => {
      if (user?.id) map.set(user.id, user)
    })
    return map
  }, [users])

  const currentChannel = channels.find((c) => c.id === activeChannelId)
  const isDirectChannel = activeChannelId?.startsWith('dm:')
  const directPeerId = useMemo(() => {
    if (!isDirectChannel) return null
    return directPeers[activeChannelId] || extractPeerIdFromChannel(activeChannelId, me?.id)
  }, [isDirectChannel, directPeers, activeChannelId, me?.id])
  const directPeer = directPeerId ? userMap.get(directPeerId) : null
  const channelMembers = currentChannel?.id ? channelMembersMap[currentChannel.id] || [] : []
  const typingUsersRaw = useMemo(() => (activeChannelId ? typingMap[activeChannelId] || [] : []), [typingMap, activeChannelId])
  const typingUsers = useMemo(
    () => typingUsersRaw.filter((entry) => entry.userId !== me?.id),
    [typingUsersRaw, me?.id],
  )
  const typingLabel = useMemo(() => {
    if (!typingUsers.length) return ''
    const names = typingUsers.map((entry) => {
      const user = entry.userId ? userMap.get(entry.userId) : null
      const username = entry.username || user?.username || entry.userId
      return username?.startsWith('@') ? username : `@${username}`
    })
    if (names.length === 1) return `${names[0]} печатает...`
    if (names.length === 2) return `${names[0]} и ${names[1]} печатают...`
    if (names.length === 3) return `${names[0]}, ${names[1]} и ${names[2]} печатают...`
    return `${names[0]}, ${names[1]} и еще ${names.length - 2} печатают...`
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
    setSelectedNewMembers((current) =>
      current.filter((userId) => availableMemberCandidates.some((candidate) => candidate.id === userId)),
    )
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

  const onScroll = (e) => {
    if (e.currentTarget.scrollTop === 0) loadMore()
  }

  const nameById = (id) => userMap.get(id)?.username || 'user'
  const avatarSrcById = (id) => {
    const user = userMap.get(id)
    return user ? buildAvatarUrl?.(user) : null
  }

  useEffect(() => {
    if (!imagePreview) return
    ensureFileMeta(imagePreview.id).catch((err) => console.error('preview meta failed', err))
  }, [imagePreview, ensureFileMeta])

  useEffect(() => {
    uploadDialogRef.current = uploadDialog
  }, [uploadDialog])

  useEffect(
    () => () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
        typingTimeoutRef.current = null
      }
      if (selfTypingRef.current && socket && activeChannelId) {
        socket.emit('typing', { channelId: activeChannelId, state: false })
        selfTypingRef.current = false
      }
    },
    [socket, activeChannelId],
  )

  useEffect(() => () => {
    const dialog = uploadDialogRef.current
    if (dialog?.items) {
      dialog.items.forEach((item) => {
        if (item.preview) URL.revokeObjectURL(item.preview)
      })
    }
  }, [])

  const previewMeta = imagePreview ? files[imagePreview.id] : null
  const previewName = imagePreview?.name || previewMeta?.name || 'Изображение'
  const previewUrl = imagePreview ? buildFileUrl?.(imagePreview.id, { inline: true }) : null
  const stepPreview = useCallback((delta) => {
    setImagePreview((current) => {
      if (!current) return current
      const siblings = current.siblings || []
      if (!siblings.length) return current
      const baseIndex =
        typeof current.index === 'number' ? current.index : siblings.findIndex((item) => item.id === current.id)
      if (baseIndex < 0) return current
      const nextIndex = baseIndex + delta
      if (nextIndex < 0 || nextIndex >= siblings.length) return current
      const nextItem = siblings[nextIndex]
      return { ...current, ...nextItem, index: nextIndex }
    })
  }, [])
  const previewSiblings = imagePreview?.siblings || []
  const previewIndex = useMemo(() => {
    if (!imagePreview) return -1
    if (typeof imagePreview.index === 'number') return imagePreview.index
    const idx = previewSiblings.findIndex((item) => item.id === imagePreview.id)
    return idx
  }, [imagePreview, previewSiblings])
  const hasPrev = previewIndex > 0
  const hasNext = previewIndex >= 0 && previewIndex < previewSiblings.length - 1
  const goPrevPreview = () => stepPreview(-1)
  const goNextPreview = () => stepPreview(1)
  const closeImagePreview = () => setImagePreview(null)
  const downloadPreview = () => {
    if (!imagePreview) return
    openFile(imagePreview.id, previewName)
  }

  useEffect(() => {
    if (!imagePreview) return undefined
    const handler = (event) => {
      if (event.key === 'Escape') setImagePreview(null)
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goPrevPreview()
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        goNextPreview()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [imagePreview, goNextPreview, goPrevPreview])

  const cleanupUploadDialog = (dialog) => {
    dialog?.items?.forEach((item) => {
      if (item.preview) URL.revokeObjectURL(item.preview)
    })
  }

  const closeUploadDialog = () => {
    setUploadDialog((state) => {
      if (state) cleanupUploadDialog(state)
      return null
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const updateUploadOptions = (patch) => {
    setUploadDialog((state) => {
      if (!state) return state
      return { ...state, options: { ...state.options, ...patch } }
    })
  }

  const removePendingFile = (id) => {
    setUploadDialog((state) => {
      if (!state) return state
      const target = state.items.find((item) => item.id === id)
      if (target?.preview) URL.revokeObjectURL(target.preview)
      const nextItems = state.items.filter((item) => item.id !== id)
      return { ...state, items: nextItems }
    })
  }

  const uploadAttachments = async (filesToUpload, comment = '') => {
    if (!filesToUpload.length) return
    const attachments = []
    try {
      for (let index = 0; index < filesToUpload.length; index += 1) {
        const file = filesToUpload[index]
        setUploadState({ current: index + 1, total: filesToUpload.length, progress: 0 })
        const uploaded = await uploadFile(file, (progress) => {
          setUploadState((state) => (state ? { ...state, progress } : state))
        })
        if (uploaded) attachments.push(uploaded)
      }
      if (attachments.length) {
        const tokens = attachments.map((file) => `[file:${file.id}:${file.name}]`)
        const blocks = []
        if (comment) blocks.push(comment)
        blocks.push(tokens.join('\n'))
        const addition = blocks.filter(Boolean).join('\n')
        const currentValue = textareaRef.current ? textareaRef.current.value : text
        const nextValue = currentValue ? `${currentValue}\n${addition}` : addition
        handleTextChange(nextValue)
      }
    } catch (err) {
      console.error(err)
      alert('Не удалось загрузить файлы')
    } finally {
      setUploadState(null)
    }
  }

  const openFile = async (id, name) => {
    const { serverUrl, token } = useStore.getState()
    if (!token) return
    try {
      const res = await fetch(`${serverUrl}/api/files/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('download_failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = name || 'file'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
      alert('Не удалось скачать файл')
    }
  }

  const confirmUploadDialog = async () => {
    const dialog = uploadDialog
    if (!dialog || dialog.loading) return
    if (!dialog.items.length) {
      closeUploadDialog()
      return
    }
    setUploadDialog({ ...dialog, loading: true, error: null })
    try {
      const processed = []
      for (const item of dialog.items) {
        let file = item.file
        if (dialog.options.compress && file.type?.startsWith('image/')) {
          file = await compressImageFile(file)
        }
        processed.push(file)
      }
      if (dialog.options.remember) {
        localStorage.setItem(
          'uploadOptions',
          JSON.stringify({
            group: dialog.options.group,
            compress: dialog.options.compress,
          }),
        )
      } else {
        localStorage.removeItem('uploadOptions')
      }
      await uploadAttachments(processed, dialog.options.comment.trim())
      cleanupUploadDialog(dialog)
      setUploadDialog(null)
    } catch (err) {
      console.error(err)
      setUploadDialog((state) => (state ? { ...state, loading: false, error: 'Не удалось загрузить файлы' } : state))
    }
  }

  const handleAddMoreFiles = () => {
    if (uploadDialog?.loading) return
    fileInputRef.current?.click()
  }

  const emitTypingState = (state) => {
    if (!socket || !activeChannelId) return
    socket.emit('typing', { channelId: activeChannelId, state })
  }

  const scheduleTypingStop = () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      if (selfTypingRef.current) {
        emitTypingState(false)
        selfTypingRef.current = false
        setSelfTyping(false)
      }
    }, 2500)
  }

  const handleTextChange = (value) => {
    setText(value)
    if (!socket || !activeChannelId) return
    if (!selfTypingRef.current) {
      emitTypingState(true)
      selfTypingRef.current = true
      setSelfTyping(true)
    }
    scheduleTypingStop()
  }

  const handleInputBlur = () => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = null
    }
    if (selfTypingRef.current) {
      emitTypingState(false)
      selfTypingRef.current = false
      setSelfTyping(false)
    }
  }

  const handleSend = () => {
    if (!text.trim()) return
    sendMessage(text)
    setText('')
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = null
    }
    if (selfTypingRef.current) {
      emitTypingState(false)
      selfTypingRef.current = false
      setSelfTyping(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFilePick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (ev) => {
    const files = Array.from(ev.target.files || [])
    if (!files.length) return
    const items = files.map((file, index) => ({
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${index}`,
      file,
      preview: file.type?.startsWith('image/') ? URL.createObjectURL(file) : null,
    }))
    setUploadDialog((state) => {
      if (state) {
        return { ...state, items: [...state.items, ...items] }
      }
      const stored = readStoredUploadOptions()
      return {
        items,
        options: { ...defaultUploadOptions, ...(stored || {}), comment: '' },
        loading: false,
        error: null,
      }
    })
    if (ev.target) ev.target.value = ''
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

  const headerTitle = isDirectChannel
    ? directPeer ? `@${directPeer.username}` : 'Личный чат'
    : currentChannel ? `#${currentChannel.name}` : 'Выберите чат'
  const headerSubtitle = isDirectChannel
    ? 'Приватный диалог'
    : currentChannel ? 'Общий канал' : ''

  return (
    <div className="flex-1 flex flex-col h-full relative">
      <div className="panel px-6 py-3 border-b border-white/10 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">{headerTitle}</div>
          <div className="text-xs text-white/60">{headerSubtitle}</div>
        </div>
        <div className="flex items-center gap-3">
          {canManageMembers && currentChannel && (
            <button
              type="button"
              onClick={openMembersDialog}
              className="px-3 py-1.5 text-xs rounded-xl bg-white/10 hover:bg-white/20 transition"
            >
              Участники
            </button>
          )}
          {uploadState && (
            <div className="text-xs text-white/60">
              Загрузка {uploadState.current}/{uploadState.total}
              {uploadState.progress != null ? ` · ${uploadState.progress}%` : ''}
            </div>
          )}
        </div>
      </div>

      <div ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-6 space-y-3 scroll-thin">
        {messages.map((m) => {
          const mine = m.senderId === me?.id
          const author = userMap.get(m.senderId)
          const { textSegments, attachments } = extractTextAndAttachments(m.content)
          const imageTokens = attachments.map((token) => ({ ...token, ...useStore.getState().files[token.id] })).filter(isTokenLikelyImage)
          const fileTokens = attachments.filter((token) => !isTokenLikelyImage(token))
          const avatarSrc = avatarSrcById(m.senderId)
          const canDelete = mine || me?.role === 'admin' || canModerateChannel
          const canEdit = mine || canModerateChannel
          const edited = m.updatedAt && m.updatedAt > (m.createdAt || 0)
          return (
            <div key={m.id} className={`max-w-[72%] px-4 py-3 rounded-3xl shadow-glass ${mine ? 'ml-auto panel' : 'glass'}`}>
              <div className="flex items-center justify-between text-[11px] text-white/70 mb-2">
                <div className="flex items-center gap-2">
                  <AvatarImage user={author} size={28} src={avatarSrc} />
                  <span>@{nameById(m.senderId)}</span>
                  <span className="opacity-60">
                    {new Date(m.createdAt || m.created_at).toLocaleTimeString()}
                    {edited ? ' · изменено' : ''}
                  </span>
                </div>
                {(canEdit || canDelete) && (
                  <div className="flex items-center gap-2 text-white/40">
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
                )}
              </div>
              <div className="whitespace-pre-wrap leading-relaxed break-words space-y-3">
                {textSegments.filter((segment) => segment && segment.trim()).map((segment, idx) => (
                  <div key={`text-${m.id}-${idx}`}>{segment}</div>
                ))}
                {imageTokens.length > 0 && (
                  <ImageGallery tokens={imageTokens} openFile={openFile} onPreview={setImagePreview} />
                )}
                {fileTokens.map((attachment) => (
                  <FileAttachment key={`file-${m.id}-${attachment.id}`} token={attachment} openFile={openFile} />
                ))}
              </div>
            </div>
          )
        })}
        {messages.length === 0 && (
          <div className="text-sm text-white/40 text-center py-10">Сообщений пока нет</div>
        )}
      </div>

      {(selfTyping || typingLabel) && (
        <div className="px-6 pb-2 text-xs text-white/60 italic">
          {[selfTyping ? 'Вы печатаете...' : null, typingLabel].filter(Boolean).join(' ')}
        </div>
      )}

      <div className="px-6 py-4 border-t border-white/10">
        <div className="panel rounded-3xl px-4 py-2 flex items-center gap-3">
          <IconButton onClick={handleFilePick} title="Прикрепить файлы">
            <PaperclipIcon />
          </IconButton>
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
            <IconButton onClick={handleSend} title="Отправить" disabled={!text.trim()} variant="primary">
              <SendIcon className="w-5 h-5" />
            </IconButton>
          </div>
        </div>
      </div>
      <input ref={fileInputRef} type="file" className="hidden" multiple onChange={handleFileChange} />
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
                <div className="glass rounded-2xl px-4 py-3 space-y-2">
                  <div className="text-xs text-white/50 uppercase tracking-[0.2em]">Сообщение</div>
                  <div className="text-sm text-white/80 whitespace-pre-wrap break-words">{deletePreviewText}</div>
                  <div className="text-xs text-white/40">
                    @{nameById(deleteDialog.message.senderId)} ·{' '}
                    {new Date(deleteDialog.message.createdAt || deleteDialog.message.created_at || Date.now()).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-white/10 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeDeleteDialog}
                className="px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 transition text-sm"
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
                  <div className="text-xs text-white/60 mt-1">@{nameById(editDialog.message.senderId)}</div>
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
                className="w-full bg-white/10 rounded-2xl px-4 py-3 text-sm text-white/90 placeholder:text-white/40 outline-none resize-none focus:ring-2 focus:ring-white/40"
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
                className="px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 transition text-sm"
                disabled={editDialog.loading}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={confirmEditMessage}
                className="px-4 py-2 rounded-2xl bg-white/80 text-black hover:bg-white transition text-sm disabled:bg-white/40 disabled:text-white/60"
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
                        className="flex items-center justify-between gap-3 glass px-3 py-2 rounded-2xl"
                      >
                        <div className="flex items-center gap-3">
                          <AvatarImage user={entry.user} size={32} src={buildAvatarUrl?.(entry.user)} />
                          <div>
                            <div className="text-sm text-white/90">@{entry.user.username}</div>
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
                          className="flex items-center justify-between gap-3 glass px-3 py-2 rounded-2xl cursor-pointer hover:bg-white/10 transition"
                        >
                          <div className="flex items-center gap-3">
                            <AvatarImage user={user} size={28} src={buildAvatarUrl?.(user)} />
                            <div className="text-sm text-white/80">@{user.username}</div>
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
                  className="px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 transition text-sm"
                  disabled={membersBusy}
                >
                  Закрыть
                </button>
                <button
                  type="button"
                  onClick={handleAddMembers}
                  className="px-4 py-2 rounded-2xl bg-white/80 text-black hover:bg-white transition text-sm disabled:bg-white/40 disabled:text-white/60"
                  disabled={membersBusy || selectedNewMembers.length === 0}
                >
                  {membersLoading ? 'Сохранение...' : 'Добавить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {uploadDialog && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-6"
          onClick={closeUploadDialog}
        >
          <div
            className="panel max-w-5xl w-full max-h-[90vh] overflow-hidden rounded-3xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-white/10">
              <div>
                <div className="text-lg font-semibold text-white/90">Выбрано {uploadDialog.items.length} файлов</div>
                <div className="text-xs text-white/60">Проверьте файлы перед отправкой</div>
              </div>
              <button
                type="button"
                onClick={closeUploadDialog}
                className="px-3 py-1.5 rounded-2xl bg-white/10 hover:bg-white/20 transition"
              >
                Закрыть
              </button>
            </div>
            {uploadDialog.error && (
              <div className="px-6 py-3 text-sm text-red-300 bg-red-500/10">{uploadDialog.error}</div>
            )}
            <div className="flex-1 overflow-y-auto px-6 py-4 grid gap-4 md:grid-cols-2">
              {uploadDialog.items.map((item, index) => {
                const isImage = item.file.type?.startsWith('image/')
                const descriptor = guessFileDescriptor(item.file)
                const glyph = guessFileGlyph(item.file)
                const sizeLabel = formatFileSize(item.file.size)
                return (
                  <div key={item.id} className="glass rounded-3xl p-4 space-y-3 relative">
                    <button
                      type="button"
                      className="absolute top-3 right-3 text-white/50 hover:text-red-300 transition"
                      onClick={() => removePendingFile(item.id)}
                      disabled={uploadDialog.loading}
                    >
                      ✕
                    </button>
                    <div
                      className={`h-40 rounded-2xl overflow-hidden flex items-center justify-center relative ${
                        isImage ? 'bg-black/40' : 'bg-gradient-to-br from-white/10 via-white/5 to-white/0'
                      }`}
                    >
                      {item.preview && isImage ? (
                        <img src={item.preview} alt={item.file.name} className="w-full h-full object-contain" />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-center px-4 text-white/70">
                          <div className="text-3xl mb-2">{glyph}</div>
                          <div className="text-xs uppercase tracking-[0.3em] text-white/50">{descriptor}</div>
                        </div>
                      )}
                      <div className="absolute left-3 top-3 text-[11px] uppercase tracking-[0.3em] text-white/50">
                        {String(index + 1).padStart(2, '0')}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm text-white/90 truncate" title={item.file.name}>
                        {item.file.name}
                      </div>
                      <div className="flex items-center justify-between text-xs text-white/50">
                        <span>{descriptor}</span>
                        <span>{sizeLabel}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
              {uploadDialog.items.length === 0 && (
                <div className="col-span-full text-sm text-white/50">Файлы не выбраны</div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-white/10 space-y-4">
              <div className="flex flex-wrap gap-4 text-sm text-white/70">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={uploadDialog.options.group}
                    onChange={(e) => updateUploadOptions({ group: e.target.checked })}
                    disabled={uploadDialog.loading}
                  />
                  Группировать
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={uploadDialog.options.compress}
                    onChange={(e) => updateUploadOptions({ compress: e.target.checked })}
                    disabled={uploadDialog.loading}
                  />
                  Сжать изображения
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={uploadDialog.options.remember}
                    onChange={(e) => updateUploadOptions({ remember: e.target.checked })}
                    disabled={uploadDialog.loading}
                  />
                  Запомнить выбор
                </label>
              </div>
              <textarea
                value={uploadDialog.options.comment}
                onChange={(e) => updateUploadOptions({ comment: e.target.value })}
                placeholder="Комментарий"
                className="w-full bg-white/10 rounded-2xl px-4 py-3 text-sm text-white/90 placeholder:text-white/40 outline-none resize-none"
                rows={3}
                disabled={uploadDialog.loading}
              />
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleAddMoreFiles}
                  className="px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 transition"
                  disabled={uploadDialog.loading}
                >
                  Добавить ещё
                </button>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={closeUploadDialog}
                    className="px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 transition"
                    disabled={uploadDialog.loading}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={confirmUploadDialog}
                    className="px-4 py-2 rounded-2xl bg-white/20 hover:bg-white/30 transition disabled:opacity-50"
                    disabled={uploadDialog.loading || uploadDialog.items.length === 0}
                  >
                    {uploadDialog.loading ? 'Отправка...' : 'Отправить'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {imagePreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-6 py-8"
          onClick={closeImagePreview}
        >
          <div className="relative max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
            {hasPrev && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  goPrevPreview()
                }}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/70 text-white flex items-center justify-center transition"
                aria-label="Предыдущее изображение"
              >
                ‹
              </button>
            )}
            {hasNext && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  goNextPreview()
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/70 text-white flex items-center justify-center transition"
                aria-label="Следующее изображение"
              >
                ›
              </button>
            )}
            {previewUrl ? (
              <img src={previewUrl} alt={previewName} className="w-full max-h-[70vh] object-contain rounded-3xl" />
            ) : (
              <div className="w-full h-[60vh] flex items-center justify-center text-white/60">
                Загрузка изображения...
              </div>
            )}
            <div className="flex items-center justify-between mt-4 text-white/80 text-sm gap-4">
              <div className="truncate">
                {previewName}
                {previewSiblings.length > 1 && previewIndex >= 0 && (
                  <span className="ml-2 text-white/40 text-xs">
                    {previewIndex + 1} / {previewSiblings.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={downloadPreview}
                  className="px-4 py-2 rounded-2xl bg-white/15 hover:bg-white/25 transition"
                >
                  Скачать
                </button>
                <button
                  type="button"
                  onClick={closeImagePreview}
                  className="px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 transition"
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


