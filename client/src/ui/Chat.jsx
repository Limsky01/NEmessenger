import React, { useEffect, useMemo, useRef, useState } from 'react'
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
  const inlineUrl = isImage && token?.id ? buildFileUrl?.(token.id, { inline: true }) : null
  return { fileName, mime, isImage, inlineUrl }
}

function FileAttachment({ token, openFile }) {
  const { fileName } = useAttachmentMeta(token)
  return (
    <button type="button" onClick={() => openFile(token.id, fileName)} className="underline flex items-center gap-2 text-left">
      <PaperclipIcon className="w-4 h-4" />
      <span>{fileName}</span>
    </button>
  )
}

function ImageAttachment({ token, openFile, style }) {
  const { fileName, inlineUrl } = useAttachmentMeta(token)
  return (
    <button
      type="button"
      onClick={() => openFile(token.id, fileName)}
      className="relative block overflow-hidden rounded-3xl focus:outline-none focus:ring-2 focus:ring-white/50"
      style={style}
    >
      {inlineUrl ? (
        <img src={inlineUrl} alt={fileName} className="absolute inset-0 w-full h-full object-cover" />
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

function ImageGallery({ tokens, openFile }) {
  const count = tokens.length
  if (count === 0) return null
  const { container, item } = buildGalleryLayout(count)

  return (
    <div className="w-full" style={container}>
      {tokens.map((token, index) => (
        <ImageAttachment key={`img-${token.id}-${index}`} token={token} openFile={openFile} style={item(index)} />
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
  const users = useStore((s) => s.users)
  const me = useStore((s) => s.user)
  const uploadFile = useStore((s) => s.uploadFile)
  const directPeers = useStore((s) => s.directPeers)
  const buildAvatarUrl = useStore((s) => s.buildAvatarUrl)

  const [text, setText] = useState('')
  const [uploadState, setUploadState] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const listRef = useRef(null)
  const fileInputRef = useRef(null)
  const textareaRef = useRef(null)
  const prevChannelRef = useRef(null)
  const prevCountRef = useRef(0)

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

  const onScroll = (e) => {
    if (e.currentTarget.scrollTop === 0) loadMore()
  }

  const nameById = (id) => userMap.get(id)?.username || 'user'
  const avatarSrcById = (id) => {
    const user = userMap.get(id)
    return user ? buildAvatarUrl?.(user) : null
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

  const handleSend = () => {
    if (!text.trim()) return
    sendMessage(text)
    setText('')
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

  const handleFileChange = async (ev) => {
    const files = Array.from(ev.target.files || [])
    if (!files.length) return
    try {
      const attachments = []
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]
        setUploadState({ current: index + 1, total: files.length, progress: 0 })
        const uploaded = await uploadFile(file, (progress) => {
          setUploadState((state) => (state ? { ...state, progress } : state))
        })
        if (uploaded) attachments.push(uploaded)
      }
      if (attachments.length) {
        setText((prev) => {
          const tokens = attachments.map((file) => `[file:${file.id}:${file.name}]`)
          const prefix = prev ? `${prev}\n` : ''
          return `${prefix}${tokens.join('\n')}`
        })
      }
    } catch (err) {
      console.error(err)
      alert('Не удалось загрузить файлы')
    } finally {
      setUploadState(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDeleteMessage = async (messageId) => {
    setPendingDelete(messageId)
    try {
      await deleteMessage(messageId)
    } catch (err) {
      console.error(err)
      alert('Не удалось удалить сообщение')
    } finally {
      setPendingDelete(null)
    }
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
        {uploadState && (
          <div className="text-xs text-white/60">
            Загрузка {uploadState.current}/{uploadState.total}
            {uploadState.progress != null ? ` · ${uploadState.progress}%` : ''}
          </div>
        )}
      </div>

      <div ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-6 space-y-3 scroll-thin">
        {messages.map((m) => {
          const mine = m.senderId === me?.id
          const author = userMap.get(m.senderId)
          const { textSegments, attachments } = extractTextAndAttachments(m.content)
          const imageTokens = attachments.map((token) => ({ ...token, ...useStore.getState().files[token.id] })).filter(isTokenLikelyImage)
          const fileTokens = attachments.filter((token) => !isTokenLikelyImage(token))
          const avatarSrc = avatarSrcById(m.senderId)
          return (
            <div key={m.id} className={`max-w-[72%] px-4 py-3 rounded-3xl shadow-glass ${mine ? 'ml-auto panel' : 'glass'}`}>
              <div className="flex items-center justify-between text-[11px] text-white/70 mb-2">
                <div className="flex items-center gap-2">
                  <AvatarImage user={author} size={28} src={avatarSrc} />
                  <span>@{nameById(m.senderId)}</span>
                  <span className="opacity-60">{new Date(m.createdAt || m.created_at).toLocaleTimeString()}</span>
                </div>
                {(mine || me?.role === 'admin') && (
                  <button
                    type="button"
                    className="text-white/40 hover:text-red-400 transition flex items-center gap-1"
                    onClick={() => handleDeleteMessage(m.id)}
                    disabled={pendingDelete === m.id}
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
              <div className="whitespace-pre-wrap leading-relaxed break-words space-y-3">
                {textSegments.filter((segment) => segment && segment.trim()).map((segment, idx) => (
                  <div key={`text-${m.id}-${idx}`}>{segment}</div>
                ))}
                {imageTokens.length > 0 && <ImageGallery tokens={imageTokens} openFile={openFile} />}
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

      <div className="px-6 py-4 border-t border-white/10">
        <div className="panel rounded-3xl px-4 py-2 flex items-center gap-3">
          <IconButton onClick={handleFilePick} title="Прикрепить файлы">
            <PaperclipIcon />
          </IconButton>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
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
    </div>
  )
}


