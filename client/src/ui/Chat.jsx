import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useStore, { buildNameStyle } from '../state/store.js'
import AvatarImage from './AvatarImage.jsx'
import MediaViewer from './MediaViewer.jsx'
import VoiceClient from '../utils/voiceClient.js'

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

function AttachIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-8.49 8.49a6 6 0 11-8.49-8.49l8.5-8.5a4 4 0 015.66 5.66l-8.49 8.5a2 2 0 11-2.83-2.83l7.78-7.79" />
    </svg>
  )
}

function MicIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  )
}

function PhoneIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.1 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

function VideoCallIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="14" height="12" rx="3" />
      <polygon points="16 10 22 7 22 17 16 14 16 10" />
    </svg>
  )
}

function ScreenIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
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

function FileIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M12 11v6" />
      <path d="M9 14l3 3 3-3" />
    </svg>
  )
}

function DownloadIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
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

function CallActionButton({ onClick, title, label, variant = 'dark', children }) {
  const palette =
    variant === 'danger'
      ? 'bg-red-500 hover:bg-red-400 text-white'
      : variant === 'light'
        ? 'bg-white text-slate-900 hover:bg-white/90'
        : 'bg-white/10 hover:bg-white/20 text-white'
  return (
    <button type="button" onClick={onClick} title={title || label} className="flex flex-col items-center gap-2 group">
      <span className={`w-14 h-14 rounded-full flex items-center justify-center transition ${palette}`}>
        {children}
      </span>
      <span className="text-xs text-white/80 group-hover:text-white transition">{label}</span>
    </button>
  )
}

function RemoteAudioPlayer({ producerId, stream, muted, outputDeviceId = 'default', onAudioRef, onAudioMeta }) {
  const ref = useRef(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (typeof onAudioRef === 'function') onAudioRef(producerId, element)
    element.srcObject = stream || null
    element.muted = Boolean(muted)
    if (typeof element.setSinkId === 'function') {
      const target = outputDeviceId && outputDeviceId !== 'default' ? outputDeviceId : ''
      element.setSinkId(target).catch(() => {})
    }
    let disposed = false
    const tryPlay = () => {
      if (disposed) return
      element
        .play()
        .then(() => {
          window.removeEventListener('pointerdown', tryPlay)
          window.removeEventListener('keydown', tryPlay)
        })
        .catch(() => {})
    }
    tryPlay()
    window.addEventListener('pointerdown', tryPlay)
    window.addEventListener('keydown', tryPlay)
    const emitMeta = () => {
      if (typeof onAudioMeta !== 'function') return
      onAudioMeta(producerId, {
        paused: element.paused,
        readyState: element.readyState,
        currentTime: Number(element.currentTime || 0),
        muted: element.muted,
      })
    }
    emitMeta()
    element.addEventListener('playing', emitMeta)
    element.addEventListener('pause', emitMeta)
    element.addEventListener('timeupdate', emitMeta)
    element.addEventListener('error', emitMeta)
    return () => {
      disposed = true
      if (typeof onAudioRef === 'function') onAudioRef(producerId, null)
      window.removeEventListener('pointerdown', tryPlay)
      window.removeEventListener('keydown', tryPlay)
      element.removeEventListener('playing', emitMeta)
      element.removeEventListener('pause', emitMeta)
      element.removeEventListener('timeupdate', emitMeta)
      element.removeEventListener('error', emitMeta)
    }
  }, [producerId, stream, muted, outputDeviceId, onAudioMeta, onAudioRef])

  return (
    <audio
      ref={ref}
      autoPlay
      playsInline
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
    />
  )
}

function FileAttachmentCard({ src, label = 'Файл', mime = '' }) {
  const [downloading, setDownloading] = useState(false)

  const handleDownload = useCallback(async () => {
    if (!src || downloading) return
    setDownloading(true)
    const downloadUrl = src.includes('?') ? `${src}&download=1` : `${src}?download=1`
    try {
      const headers = /ngrok-free\.(dev|app)/i.test(downloadUrl) ? { 'ngrok-skip-browser-warning': 'true' } : {}
      const response = await fetch(downloadUrl, { method: 'GET', cache: 'no-store', headers })
      if (!response.ok) throw new Error(`file_http_${response.status}`)
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = label || 'file'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (err) {
      console.error('file download failed', err)
    } finally {
      setDownloading(false)
    }
  }, [src, downloading, label])

  return (
    <div className="w-full max-w-sm rounded-2xl bg-white/8 border border-white/10 px-3 py-2 flex items-center justify-between gap-3">
      <div className="min-w-0 flex items-center gap-2">
        <span className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-white/80">
          <FileIcon className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <div className="text-sm text-white/90 truncate">{label || 'Файл'}</div>
          <div className="text-[11px] text-white/50 truncate">{mime || 'document'}</div>
        </div>
      </div>

      
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="w-9 h-9 rounded-full bg-sky-400 text-slate-950 hover:bg-sky-300 transition flex items-center justify-center disabled:opacity-60"
        title="Скачать файл"
      >
        <DownloadIcon className="w-4 h-4" />
      </button>
    </div>
  )
}

function ResolvedMedia({ src, mime = '', label = 'file', outputDeviceId = 'default', onOpen }) {
  const [resolvedSrc, setResolvedSrc] = useState(null)
  const [failed, setFailed] = useState(false)
  const audioRef = useRef(null)

  useEffect(() => {
    setFailed(false)
  }, [src])

  useEffect(() => {
    if (!src || typeof src !== 'string') {
      setResolvedSrc(null)
      return undefined
    }
    if (src.startsWith('blob:') || src.startsWith('data:') || !/ngrok-free\.(dev|app)/i.test(src)) {
      setResolvedSrc(src)
      return undefined
    }
    const controller = new AbortController()
    let objectUrl = null
    fetch(src, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'ngrok-skip-browser-warning': 'true' },
    })
      .then((response) => {
        if (!response.ok) throw new Error(`media_http_${response.status}`)
        return response.blob()
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        setResolvedSrc(objectUrl)
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        setResolvedSrc(src)
      })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src])

  if (!resolvedSrc || failed) return <span className="text-xs text-white/50">Не удалось загрузить {label}</span>

  if (mime.startsWith('image/')) {
    return (
      // image opens viewer on click
      <img
        src={resolvedSrc}
        alt={label}
        className="max-w-[28rem] max-h-[60vh] object-contain rounded-xl border border-white/10 cursor-zoom-in"
        onError={() => setFailed(true)}
        onClick={() => onOpen && onOpen()}
      />
    )
  }
  if (mime.startsWith('video/')) {
    return (
      <div className="relative inline-block max-w-[28rem] max-h-[60vh]">
        <video src={resolvedSrc} controls className="w-full h-auto rounded-xl border border-white/10 object-contain" onError={() => setFailed(true)} />
        <button
          type="button"
          onClick={() => onOpen && onOpen()}
          className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-black/30 flex items-center justify-center text-white hover:bg-black/40"
          title="Открыть видео"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </button>
      </div>
    )
  }
  if (mime.startsWith('audio/')) {
    return (
      <audio
        ref={audioRef}
        controls
        className="w-full max-w-sm"
        onCanPlay={() => {
          const audio = audioRef.current
          if (!audio || typeof audio.setSinkId !== 'function') return
          const target = outputDeviceId && outputDeviceId !== 'default' ? outputDeviceId : ''
          audio.setSinkId(target).catch(() => {})
        }}
        onError={() => setFailed(true)}
      >
        <source src={resolvedSrc} type={mime} />
      </audio>
    )
  }
  return <FileAttachmentCard src={src} label={label} mime={mime} />
}

function formatVoiceTime(value) {
  const total = Math.max(0, Math.floor(Number(value) || 0))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function VoiceBubble({ src, mime = 'audio/webm', duration = 0, outputDeviceId = 'default', fallbackServerUrl = '' }) {
  const audioRef = useRef(null)
  const [resolvedSrc, setResolvedSrc] = useState(null)
  const [failed, setFailed] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [total, setTotal] = useState(duration || 0)

  useEffect(() => {
    setFailed(false)
  }, [src])

  useEffect(() => {
    if (!src || typeof src !== 'string') {
      setResolvedSrc(null)
      return undefined
    }
    if (src.startsWith('blob:') || src.startsWith('data:') || !/ngrok-free\.(dev|app)/i.test(src)) {
      setResolvedSrc(src)
      return undefined
    }

    const controller = new AbortController()
    let objectUrl = null

    const buildFallbackUrl = () => {
      if (!fallbackServerUrl) return null
      try {
        const original = new URL(src)
        if (!/ngrok-free\.(dev|app)$/i.test(original.hostname)) return null
        if (!original.pathname.startsWith('/api/media/')) return null
        const base = fallbackServerUrl.endsWith('/') ? fallbackServerUrl : `${fallbackServerUrl}/`
        return new URL(`${original.pathname}${original.search || ''}`, base).toString()
      } catch (_) {
        return null
      }
    }

    const fetchVoiceAsBlob = async (targetUrl) => {
      const headers = /ngrok-free\.(dev|app)/i.test(targetUrl) ? { 'ngrok-skip-browser-warning': 'true' } : {}
      const response = await fetch(targetUrl, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
        headers,
      })
      if (!response.ok) throw new Error(`voice_http_${response.status}`)
      const contentType = String(response.headers.get('content-type') || '').toLowerCase()
      if (contentType.startsWith('text/html')) throw new Error('voice_bad_content_type')
      return response.blob()
    }

    const fallbackUrl = buildFallbackUrl()
    fetchVoiceAsBlob(src)
      .catch((err) => {
        if (err?.name === 'AbortError') throw err
        if (fallbackUrl && fallbackUrl !== src) return fetchVoiceAsBlob(fallbackUrl)
        throw err
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        setResolvedSrc(objectUrl)
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        setResolvedSrc(src)
      })

    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src, fallbackServerUrl])

  useEffect(() => {
    setPlaying(false)
    setCurrent(0)
    setTotal(duration || 0)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
  }, [src, duration])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || typeof audio.setSinkId !== 'function') return
    const target = outputDeviceId && outputDeviceId !== 'default' ? outputDeviceId : ''
    audio.setSinkId(target).catch(() => {})
  }, [outputDeviceId, src])

  const handleToggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      audio.play().catch(() => {})
      setPlaying(true)
    } else {
      audio.pause()
      setPlaying(false)
    }
  }

  const progress = total > 0 ? Math.min(100, (current / total) * 100) : 0

  return (
    <div className="w-full max-w-sm rounded-2xl bg-white/8 border border-white/10 px-3 py-2 flex items-center gap-3">
      <button
        type="button"
        onClick={handleToggle}
        disabled={!resolvedSrc || failed}
        className="w-9 h-9 rounded-full bg-sky-400 text-slate-950 flex items-center justify-center text-sm font-bold disabled:opacity-60"
        title={playing ? 'Пауза' : 'Воспроизвести'}
      >
        {playing ? 'II' : '▶'}
      </button>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="h-1.5 rounded-full bg-white/15 overflow-hidden">
          <div className="h-full bg-sky-300" style={{ width: `${progress}%` }} />
        </div>
        <div className="text-[11px] text-white/65">
          {failed ? 'Не удалось загрузить голосовое' : `${formatVoiceTime(current)} / ${formatVoiceTime(total || duration || 0)}`}
        </div>
      </div>
      <audio
        ref={audioRef}
        preload="metadata"
        className="hidden"
        onError={(event) => {
          const element = event.currentTarget
          if (!resolvedSrc || !element?.currentSrc) return
          setFailed(true)
        }}
        onLoadedMetadata={(event) => {
          const value = Number(event.currentTarget.duration)
          if (Number.isFinite(value) && value > 0) setTotal(value)
        }}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime || 0)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setCurrent(0)
        }}
      >
        {resolvedSrc ? <source src={resolvedSrc} type={mime} /> : null}
      </audio>
    </div>
  )
}

const extractTextAndAttachments = (content) => {
  if (typeof content !== 'string') {
    return { textSegments: [content], attachments: [], voice: null }
  }
  const prefix = 'MSGJSON:'
  if (!content.startsWith(prefix)) return { textSegments: [content], attachments: [], voice: null }
  try {
    const parsed = JSON.parse(content.slice(prefix.length))
    const text = typeof parsed?.text === 'string' ? parsed.text : ''
    const attachments = Array.isArray(parsed?.attachments) ? parsed.attachments : []
    const voice = parsed?.voice && typeof parsed.voice === 'object' ? parsed.voice : null
    return { textSegments: text ? [text] : [], attachments, voice }
  } catch (_) {
    return { textSegments: ['Файл'], attachments: [], voice: null }
  }
}

const serializeRichMessage = ({ text = '', attachments = [], voice = null }) =>
  `MSGJSON:${JSON.stringify({ text: String(text || ''), attachments, voice: voice || null })}`

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
  const buildChannelAvatarUrl = useStore((s) => s.buildChannelAvatarUrl)
  const channelMembersMap = useStore((s) => s.channelMembers)
  const fetchChannelMembers = useStore((s) => s.fetchChannelMembers)
  const addChannelMember = useStore((s) => s.addChannelMember)
  const removeChannelMember = useStore((s) => s.removeChannelMember)
  const deleteChannel = useStore((s) => s.deleteChannel)
  const typingMap = useStore((s) => s.typing)
  const socket = useStore((s) => s.socket)
  const uploadMedia = useStore((s) => s.uploadMedia)
  const buildMediaUrl = useStore((s) => s.buildMediaUrl)
  const serverUrl = useStore((s) => s.serverUrl)
  const voiceServerUrl = useStore((s) => s.voiceServerUrl)
  const audioInputDeviceId = useStore((s) => s.audioInputDeviceId)
  const audioOutputDeviceId = useStore((s) => s.audioOutputDeviceId)

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
  const [selectedProfileUser, setSelectedProfileUser] = useState(null)
  const [sendingMedia, setSendingMedia] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [recordingVoice, setRecordingVoice] = useState(false)
  const [voiceLocked, setVoiceLocked] = useState(false)
  const [recordElapsedSec, setRecordElapsedSec] = useState(0)
  const [pendingFile, setPendingFile] = useState(null)
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState('')
  const [pendingFileError, setPendingFileError] = useState(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerItems, setViewerItems] = useState([])
  const [viewerIndex, setViewerIndex] = useState(0)
  const [callOpen, setCallOpen] = useState(false)
  const [callVideoEnabled, setCallVideoEnabled] = useState(false)
  const [callMicMuted, setCallMicMuted] = useState(false)
  const [callSoundMuted, setCallSoundMuted] = useState(false)
  const [callScreenSharing, setCallScreenSharing] = useState(false)
  const [callDurationSec, setCallDurationSec] = useState(0)
  const [callConnectionStatus, setCallConnectionStatus] = useState('idle')
  const [callError, setCallError] = useState('')
  const [callHint, setCallHint] = useState('')
  const [callRemoteCount, setCallRemoteCount] = useState(0)
  const [remoteAudios, setRemoteAudios] = useState([])
  const [remoteSpeaking, setRemoteSpeaking] = useState(false)
  const [callDebugOpen, setCallDebugOpen] = useState(true)
  const [callDebugEvents, setCallDebugEvents] = useState([])
  const [callDebugAudios, setCallDebugAudios] = useState({})
  const [callDebugSnapshot, setCallDebugSnapshot] = useState({
    serverUrl: '',
    roomId: '',
    socketConnected: false,
    socketId: '',
    sendTransportId: '',
    recvTransportId: '',
    producerId: '',
    consumerCount: 0,
    consumerProducerIds: [],
  })
  const listRef = useRef(null)
  const textareaRef = useRef(null)
  const prevChannelRef = useRef(null)
  const prevCountRef = useRef(0)
  const typingTimeoutRef = useRef(null)
  const selfTypingRef = useRef(false)
  const prevTypingChannelRef = useRef(null)
  const headerRef = useRef(null)
  const fileInputRef = useRef(null)
  const recorderRef = useRef(null)
  const recorderChunksRef = useRef([])
  const recordStartedAtRef = useRef(0)
  const shouldSendRecordingRef = useRef(true)
  const pressActiveRef = useRef(false)
  const pressStartYRef = useRef(0)
  const voiceClientRef = useRef(null)
  const callAttemptIdRef = useRef(0)
  const remoteSpeakingRafRef = useRef(null)
  const remoteSpeakingAudioContextRef = useRef(null)
  const remoteAudioNodesRef = useRef(new Map())

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
  const directPeerRawStatus = directPeer?.userStatus || 'online'
  const directPeerInvisible = directPeerRawStatus === 'invisible'
  const directPeerOnline = directPeerId ? onlineSet.has(directPeerId) && !directPeerInvisible : false
  const directPeerStatusLabel = directPeerOnline
    ? directPeerRawStatus === 'dnd'
      ? 'Занят'
      : directPeerRawStatus === 'idle'
      ? 'Неактивен'
      : 'В сети'
    : directPeerInvisible
    ? 'Невидимый'
    : 'Оффлайн'
  const directPeerStatusColor = directPeerRawStatus === 'dnd'
    ? 'bg-red-500'
    : directPeerRawStatus === 'idle'
    ? 'bg-yellow-400'
    : 'bg-emerald-400'
  const directPeerProfileStatus = directPeer?.profileStatus || ''
  const directPeerBackground = directPeer?.profileBackground || ''
  const directPeerBannerStyle = directPeerBackground ? { backgroundImage: `url(${directPeerBackground})` } : undefined
  const selectedProfileStatus = selectedProfileUser?.profileStatus || ''
  const selectedProfileBackground = selectedProfileUser?.profileBackground || ''
  const selectedProfileBannerStyle = selectedProfileBackground ? { backgroundImage: `url(${selectedProfileBackground})` } : undefined
  const selectedProfileRawStatus = selectedProfileUser?.userStatus || 'online'
  const selectedProfileInvisible = selectedProfileRawStatus === 'invisible'
  const selectedProfileOnline = selectedProfileUser?.id ? onlineSet.has(selectedProfileUser.id) && !selectedProfileInvisible : false
  const selectedProfileStatusLabel = selectedProfileOnline
    ? selectedProfileRawStatus === 'dnd'
      ? 'Занят'
      : selectedProfileRawStatus === 'idle'
      ? 'Неактивен'
      : 'В сети'
    : selectedProfileInvisible
    ? 'Невидимый'
    : 'Оффлайн'
  const selectedProfileStatusColor = selectedProfileRawStatus === 'dnd'
    ? 'bg-red-500'
    : selectedProfileRawStatus === 'idle'
    ? 'bg-yellow-400'
    : 'bg-emerald-400'
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
    const { textSegments, attachments, voice } = extractTextAndAttachments(deleteDialog.message.content)
    const text = textSegments.join(' ').trim()
    if (text) return text
    if (voice) return 'Голосовое сообщение'
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

  useEffect(() => {
    return () => {
      if (pendingPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(pendingPreviewUrl)
    }
  }, [pendingPreviewUrl])

  useEffect(() => {
    if (!recordingVoice) {
      setRecordElapsedSec(0)
      return undefined
    }
    const timer = setInterval(() => {
      const sec = Math.max(0, Math.floor((Date.now() - recordStartedAtRef.current) / 1000))
      setRecordElapsedSec(sec)
    }, 200)
    return () => clearInterval(timer)
  }, [recordingVoice])

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

  const handleSend = useCallback(async () => {
    if (!text.trim()) return
    try {
      await sendMessage(text, replyTarget?.id || null)
      setText('')
      setReplyTarget(null)
      stopTyping()
    } catch (err) {
      console.error('send message failed', err)
    }
  }, [replyTarget?.id, sendMessage, stopTyping, text])

  const handleMediaSelect = useCallback(
    async (event) => {
      const file = event.target.files?.[0]
      if (!file || sendingMedia) return
      setPendingFileError(null)
      setPendingFile(file)
      if (file.type?.startsWith('image/') || file.type?.startsWith('video/') || file.type?.startsWith('audio/')) {
        setPendingPreviewUrl(URL.createObjectURL(file))
      } else {
        setPendingPreviewUrl('')
      }
      // client-side size validation to match server limit
      try {
        const MAX_MEDIA_FILE_SIZE = 25 * 1024 * 1024 // 25 MB
        if (typeof file.size === 'number' && file.size > MAX_MEDIA_FILE_SIZE) {
          setPendingFileError('Файл слишком большой. Максимум 25 MB')
        }
      if (event.target) event.target.value = ''
    },
    [sendingMedia],
  )

  const clearPendingFile = useCallback(() => {
    setPendingFile(null)
    if (pendingPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(pendingPreviewUrl)
    setPendingPreviewUrl('')
    setPendingFileError(null)
  }, [pendingPreviewUrl])

  const handleSendPendingFile = useCallback(async () => {
    if (!pendingFile || sendingMedia) return
    const MAX_MEDIA_FILE_SIZE = 25 * 1024 * 1024 // 25 MB
    if (typeof pendingFile.size === 'number' && pendingFile.size > MAX_MEDIA_FILE_SIZE) {
      setPendingFileError('Файл слишком большой. Максимум 25 MB')
      return
    }
    setSendingMedia(true)
    setUploadProgress(0)
    try {
      const media = await uploadMedia(pendingFile, (p) => setUploadProgress(p))
      if (!media) throw new Error('upload_failed')
      const payload = serializeRichMessage({
        text: text.trim(),
        attachments: [{ ...media, kind: 'file' }],
        voice: null,
      })
      await sendMessage(payload, replyTarget?.id || null)
      setText('')
      setReplyTarget(null)
      clearPendingFile()
    } catch (err) {
      console.error('media upload failed', err)
      // surface common server errors to the user
      const serverErr = err?.response?.data?.error || err?.message || ''
      if (serverErr === 'media_too_large') setPendingFileError('Файл слишком большой. Максимум 25 MB')
      else setPendingFileError('Ошибка при загрузке файла')
    } finally {
      setSendingMedia(false)
      setUploadProgress(null)
    }
  }, [clearPendingFile, pendingFile, replyTarget?.id, sendMessage, sendingMedia, text, uploadMedia])

  const stopVoiceRecording = useCallback((send = true) => {
    shouldSendRecordingRef.current = Boolean(send)
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    setVoiceLocked(false)
  }, [])

  const startVoiceRecording = useCallback(async () => {
    if (sendingMedia || recordingVoice || typeof MediaRecorder === 'undefined') return
    try {
      const audioConstraint =
        audioInputDeviceId && audioInputDeviceId !== 'default'
          ? { deviceId: { exact: audioInputDeviceId } }
          : true
      let stream = null
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint })
      } catch (err) {
        if (audioConstraint !== true) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        } else {
          throw err
        }
      }
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      recorderChunksRef.current = []
      recordStartedAtRef.current = Date.now()
      shouldSendRecordingRef.current = true
      recorder.ondataavailable = (event) => {
        if (event.data?.size) recorderChunksRef.current.push(event.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        recorderRef.current = null
        setRecordingVoice(false)
        const shouldSend = shouldSendRecordingRef.current
        shouldSendRecordingRef.current = true
        if (!shouldSend) return
        const blob = new Blob(recorderChunksRef.current, { type: 'audio/webm' })
        if (!blob.size) return
        setSendingMedia(true)
        try {
          const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' })
          const media = await uploadMedia(file, (p) => setUploadProgress(p))
          if (!media) throw new Error('upload_failed')
          const durationSec = Math.max(1, Math.round((Date.now() - recordStartedAtRef.current) / 1000))
          const payload = serializeRichMessage({
            text: '',
            attachments: [],
            voice: { ...media, duration: durationSec },
          })
          await sendMessage(payload, replyTarget?.id || null)
          setReplyTarget(null)
        } catch (err) {
          console.error('voice upload failed', err)
        } finally {
          setSendingMedia(false)
          setUploadProgress(null)
        }
      }
      recorderRef.current = recorder
      recorder.start()
      setRecordingVoice(true)
      setVoiceLocked(false)
    } catch (err) {
      console.error('voice record init failed', err)
    }
  }, [recordingVoice, replyTarget?.id, sendMessage, sendingMedia, uploadMedia])

  const handleMicPointerDown = useCallback(
    async (event) => {
      if (text.trim()) return
      pressActiveRef.current = true
      pressStartYRef.current = event.clientY || 0
      await startVoiceRecording()
    },
    [startVoiceRecording, text],
  )

  const handleMicPointerMove = useCallback((event) => {
    if (!pressActiveRef.current || !recordingVoice || voiceLocked) return
    const delta = (pressStartYRef.current || 0) - (event.clientY || 0)
    if (delta > 56) {
      setVoiceLocked(true)
    }
  }, [recordingVoice, voiceLocked])

  const handleMicPointerUp = useCallback(() => {
    if (!pressActiveRef.current) return
    pressActiveRef.current = false
    if (recordingVoice && !voiceLocked) {
      stopVoiceRecording(true)
    }
  }, [recordingVoice, voiceLocked, stopVoiceRecording])

  const handleMicPointerCancel = useCallback(() => {
    if (!pressActiveRef.current) return
    pressActiveRef.current = false
    if (recordingVoice && !voiceLocked) {
      stopVoiceRecording(true)
    }
  }, [recordingVoice, voiceLocked, stopVoiceRecording])

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
    const { textSegments, attachments, voice } = extractTextAndAttachments(message.content)
    const text = textSegments.join(' ').trim()
    if (text) return text.length > 140 ? `${text.slice(0, 137)}...` : text
    if (voice) return 'Голосовое сообщение'
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
  const callPartnerName = isDirectChannel
    ? directPeerLabel || 'Личный контакт'
    : currentChannel
      ? `#${currentChannel.name}`
      : 'Голосовой чат'
  const callAvatarSrc = isDirectChannel
    ? buildAvatarUrl?.(directPeer)
    : (currentChannel ? buildChannelAvatarUrl?.(currentChannel) : null)
  const callAvatarFallback = isDirectChannel
    ? (callPartnerName.slice(0, 2) || 'VC')
    : (currentChannel?.name?.slice(0, 2) || 'VC')
  const callStatusText =
    callConnectionStatus === 'connecting'
      ? 'подключение...'
      : callConnectionStatus === 'error'
        ? (
            callError === 'socket_connect_timeout'
              ? 'таймаут подключения'
              : callError === 'socket_not_connected' || callError === 'socket_connect_error'
                ? 'нет соединения с voice-сервером'
                : callError || 'ошибка соединения'
          )
        : callDurationSec > 0
          ? `в звонке ${formatVoiceTime(callDurationSec)}`
          : 'вызов...'

  const attachRemoteTrack = useCallback(({ producerId, track }) => {
    if (!track || !producerId) return
    const stream = new MediaStream([track])
    setRemoteAudios((current) => {
      const filtered = current.filter((entry) => entry.producerId !== producerId)
      return [...filtered, { producerId, stream }]
    })
  }, [])

  const detachRemoteTrack = useCallback((producerId) => {
    if (!producerId) return
    setRemoteAudios((current) => current.filter((entry) => entry.producerId !== producerId))
  }, [])

  const detachAllRemoteTracks = useCallback(() => setRemoteAudios([]), [])
  const handleRemoteAudioRef = useCallback((producerId, node) => {
    if (!producerId) return
    if (node) remoteAudioNodesRef.current.set(producerId, node)
    else remoteAudioNodesRef.current.delete(producerId)
  }, [])

  const handleRemoteAudioMeta = useCallback((producerId, meta) => {
    if (!producerId) return
    setCallDebugAudios((current) => ({ ...current, [producerId]: meta }))
  }, [])

  const openCallScreen = async () => {
    if (!hasActiveChannel) return
    setCallDurationSec(0)
    setCallVideoEnabled(false)
    setCallMicMuted(false)
    setCallSoundMuted(false)
    setCallScreenSharing(false)
    setCallConnectionStatus('connecting')
    setCallError('')
    setCallHint('')
    setCallRemoteCount(0)
    setCallDebugEvents([])
    setCallDebugAudios({})
    const attemptId = callAttemptIdRef.current + 1
    callAttemptIdRef.current = attemptId
    setCallOpen(true)
    if (voiceClientRef.current) {
      await voiceClientRef.current.stop().catch(() => {})
      voiceClientRef.current = null
    }
    try {
      const voiceUrl = voiceServerUrl || import.meta.env.VITE_VOICE_SERVER || 'http://localhost:4010'
      const roomId = `voice:${activeChannelId}`
      const session = new VoiceClient({
        serverUrl: voiceUrl,
        onState: (state) => setCallConnectionStatus(state),
        onRemoteTrack: attachRemoteTrack,
        onRemoteClosed: ({ producerId }) => detachRemoteTrack(producerId),
        onDebug: (event) => {
          setCallDebugEvents((current) => [event, ...current].slice(0, 20))
        },
      })
      voiceClientRef.current = session
      await session.start({
        roomId,
        userId: me?.id || null,
        displayName: me?.displayName || me?.username || 'user',
      })
      if (callAttemptIdRef.current !== attemptId) return
      setCallConnectionStatus('connected')
    } catch (error) {
      if (callAttemptIdRef.current !== attemptId) return
      setCallConnectionStatus('error')
      setCallError(error?.message || 'voice_connect_failed')
    }
  }

  const endCall = async () => {
    callAttemptIdRef.current += 1
    setCallOpen(false)
    setCallDurationSec(0)
    setCallConnectionStatus('idle')
    setCallError('')
    setCallHint('')
    setCallRemoteCount(0)
    setCallDebugEvents([])
    setCallDebugAudios({})
    setCallDebugSnapshot({
      serverUrl: '',
      roomId: '',
      socketConnected: false,
      socketId: '',
      sendTransportId: '',
      recvTransportId: '',
      producerId: '',
      consumerCount: 0,
      consumerProducerIds: [],
    })
    detachAllRemoteTracks()
    if (voiceClientRef.current) {
      voiceClientRef.current.stop().catch(() => {})
      voiceClientRef.current = null
    }
  }

  useEffect(() => {
    if (!peerProfileOpen) return undefined
    const handleKey = (event) => {
      if (event.key === 'Escape') setPeerProfileOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [peerProfileOpen])

  useEffect(() => {
    if (!callOpen) return undefined
    const timer = setInterval(() => {
      setCallDurationSec((value) => value + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [callOpen])

  useEffect(() => {
    if (!voiceClientRef.current) return
    voiceClientRef.current.setMicEnabled(!callMicMuted)
  }, [callMicMuted])

  useEffect(() => {
    if (!callOpen) return undefined
    const timer = setInterval(() => {
      if (!voiceClientRef.current) return
      setCallDebugSnapshot(voiceClientRef.current.getDebugSnapshot())
    }, 700)
    return () => clearInterval(timer)
  }, [callOpen])

  useEffect(() => {
    setCallRemoteCount(remoteAudios.length)
  }, [remoteAudios.length])

  useEffect(() => {
    const stream = remoteAudios[0]?.stream || null
    if (!callOpen || !stream) {
      setRemoteSpeaking(false)
      if (remoteSpeakingRafRef.current) {
        cancelAnimationFrame(remoteSpeakingRafRef.current)
        remoteSpeakingRafRef.current = null
      }
      if (remoteSpeakingAudioContextRef.current) {
        try {
          remoteSpeakingAudioContextRef.current.close()
        } catch (_) {}
        remoteSpeakingAudioContextRef.current = null
      }
      return undefined
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return undefined
    const context = new AudioContextClass()
    remoteSpeakingAudioContextRef.current = context
    const analyser = context.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.55
    const source = context.createMediaStreamSource(stream)
    source.connect(analyser)

    const buffer = new Uint8Array(analyser.fftSize)
    let lastVoiceAt = 0

    const tick = () => {
      analyser.getByteTimeDomainData(buffer)
      let sumSquares = 0
      for (let i = 0; i < buffer.length; i += 1) {
        const centered = (buffer[i] - 128) / 128
        sumSquares += centered * centered
      }
      const rms = Math.sqrt(sumSquares / buffer.length)
      const now = Date.now()
      if (rms > 0.02) lastVoiceAt = now
      const speakingNow = now - lastVoiceAt < 240
      setRemoteSpeaking((prev) => (prev === speakingNow ? prev : speakingNow))
      remoteSpeakingRafRef.current = requestAnimationFrame(tick)
    }

    if (context.state === 'suspended') {
      context.resume().catch(() => {})
    }
    remoteSpeakingRafRef.current = requestAnimationFrame(tick)

    return () => {
      if (remoteSpeakingRafRef.current) {
        cancelAnimationFrame(remoteSpeakingRafRef.current)
        remoteSpeakingRafRef.current = null
      }
      try {
        source.disconnect()
      } catch (_) {}
      try {
        context.close()
      } catch (_) {}
      if (remoteSpeakingAudioContextRef.current === context) {
        remoteSpeakingAudioContextRef.current = null
      }
    }
  }, [callOpen, remoteAudios])

  useEffect(() => {
    if (!callOpen) return
    endCall().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannelId])

  useEffect(() => () => {
    if (voiceClientRef.current) {
      voiceClientRef.current.stop().catch(() => {})
      voiceClientRef.current = null
    }
    if (remoteSpeakingRafRef.current) {
      cancelAnimationFrame(remoteSpeakingRafRef.current)
      remoteSpeakingRafRef.current = null
    }
    if (remoteSpeakingAudioContextRef.current) {
      try {
        remoteSpeakingAudioContextRef.current.close()
      } catch (_) {}
      remoteSpeakingAudioContextRef.current = null
    }
    detachAllRemoteTracks()
  }, [detachAllRemoteTracks])

  return (
    <div className="flex-1 flex flex-col h-full relative">
      {remoteAudios.map((entry) => (
        <RemoteAudioPlayer
          key={entry.producerId}
          producerId={entry.producerId}
          stream={entry.stream}
          muted={callSoundMuted}
          outputDeviceId={audioOutputDeviceId}
          onAudioRef={handleRemoteAudioRef}
          onAudioMeta={handleRemoteAudioMeta}
        />
      ))}
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
          {hasActiveChannel && (
            <IconButton onClick={openCallScreen} title="Позвонить">
              <PhoneIcon className="w-4 h-4" />
            </IconButton>
          )}
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

      {callOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b1118]/90 backdrop-blur-sm px-4 py-6">
          <div className="relative w-full max-w-5xl h-[86vh] rounded-3xl border border-white/10 overflow-hidden bg-[radial-gradient(circle_at_top,#1a2633_0%,#0f1721_58%,#0b1118_100%)] shadow-[0_20px_80px_rgba(0,0,0,0.6)]">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-[-140px] left-1/2 -translate-x-1/2 w-[420px] h-[420px] rounded-full bg-sky-500/10 blur-3xl" />
            </div>
            <div className="relative h-full flex flex-col">
              <div className="h-12 flex items-center justify-end px-5 text-white/80">
                <button
                  type="button"
                  onClick={() => setCallDebugOpen((value) => !value)}
                  className="mr-2 px-3 h-9 rounded-xl bg-white/5 hover:bg-white/10 transition text-xs"
                  title="Показать/скрыть debug"
                >
                  DEBUG
                </button>
                <button
                  type="button"
                  onClick={endCall}
                  className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 transition"
                  title="Закрыть"
                >
                  x
                </button>
              </div>

              {callDebugOpen && (
                <div className="absolute left-4 top-14 w-[360px] max-h-[55vh] overflow-auto rounded-2xl border border-white/15 bg-[#0b1320]/85 backdrop-blur-sm p-3 text-[11px] text-white/80 space-y-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">Voice Debug</div>
                  <div>status: <span className="text-white">{callConnectionStatus}</span></div>
                  <div>error: <span className="text-red-300">{callError || '-'}</span></div>
                  <div>server: <span className="text-sky-300 break-all">{callDebugSnapshot.serverUrl || '-'}</span></div>
                  <div>room: <span className="text-white break-all">{callDebugSnapshot.roomId || '-'}</span></div>
                  <div>socket: <span className={callDebugSnapshot.socketConnected ? 'text-emerald-300' : 'text-red-300'}>{String(callDebugSnapshot.socketConnected)}</span> ({callDebugSnapshot.socketId || '-'})</div>
                  <div>sendTransport: <span className="text-white break-all">{callDebugSnapshot.sendTransportId || '-'}</span></div>
                  <div>recvTransport: <span className="text-white break-all">{callDebugSnapshot.recvTransportId || '-'}</span></div>
                  <div>producer: <span className="text-white break-all">{callDebugSnapshot.producerId || '-'}</span></div>
                  <div>consumers: <span className="text-white">{callDebugSnapshot.consumerCount}</span></div>
                  <div>remoteAudios: <span className="text-white">{remoteAudios.length}</span></div>
                  <div className="pt-1 border-t border-white/10">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-white/50 mb-1">Audio Nodes</div>
                    {Object.keys(callDebugAudios).length === 0 ? (
                      <div className="text-white/50">нет данных</div>
                    ) : (
                      Object.entries(callDebugAudios).map(([producerId, meta]) => (
                        <div key={producerId} className="mb-1 break-all">
                          <div className="text-white/70">{producerId}</div>
                          <div className="text-white/55">
                            ready={meta?.readyState ?? '-'} paused={String(meta?.paused)} muted={String(meta?.muted)} t={Number(meta?.currentTime || 0).toFixed(1)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="pt-1 border-t border-white/10">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-white/50 mb-1">Events</div>
                    <div className="space-y-1">
                      {callDebugEvents.length === 0 ? (
                        <div className="text-white/50">событий пока нет</div>
                      ) : (
                        callDebugEvents.map((event, index) => (
                          <div key={`${event.at}-${index}`} className="text-white/70">
                            {new Date(event.at).toLocaleTimeString()} • {event.event}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6">
                <div className="relative">
                  {callAvatarSrc ? (
                    <img
                      src={callAvatarSrc}
                      alt={callPartnerName}
                      className="w-[220px] h-[220px] rounded-full object-cover border border-white/15 shadow-[0_16px_38px_rgba(0,0,0,0.45)]"
                    />
                  ) : (
                    <div className="w-[220px] h-[220px] rounded-full bg-sky-900/35 border border-sky-300/25 flex items-center justify-center text-4xl font-semibold text-white/85">
                      {callAvatarFallback.toUpperCase()}
                    </div>
                  )}
                  <span
                    className={`absolute -inset-2 rounded-full border pointer-events-none transition-all duration-150 ${
                      remoteSpeaking
                        ? 'border-emerald-400 shadow-[0_0_0_6px_rgba(16,185,129,0.18),0_0_26px_rgba(16,185,129,0.45)]'
                        : 'border-sky-300/30 animate-pulse'
                    }`}
                  />
                </div>
                <div className="text-center">
                  <div className="text-5xl tracking-[0.2em] text-white/60 mb-2">···</div>
                  <div className="text-5xl tracking-[0.2em] text-white/60 -mt-3 mb-2">···</div>
                  <div className="text-4xl font-semibold text-white">{callPartnerName}</div>
                  <div className="text-xl text-white/65 mt-2">{callStatusText}</div>
                  <div className="text-sm text-white/45 mt-1">участников в голосе: {Math.max(1, callRemoteCount + 1)}</div>
                  {callConnectionStatus === 'error' && (
                    <div className="text-xs text-red-300 mt-2">Проверьте `VITE_VOICE_SERVER` и доступность voice-сервера</div>
                  )}
                  {callHint && <div className="text-xs text-sky-300 mt-2">{callHint}</div>}
                </div>
              </div>

              <div className="pb-10 px-8">
                <div className="mx-auto max-w-2xl flex items-end justify-center gap-8">
                  <CallActionButton
                    onClick={() => {
                      setCallScreenSharing((value) => !value)
                      setCallHint('Демонстрация экрана будет доступна после включения video-кодеков на voice-сервере')
                    }}
                    label="Экран"
                    variant={callScreenSharing ? 'light' : 'dark'}
                  >
                    <ScreenIcon className="w-6 h-6" />
                  </CallActionButton>
                  <CallActionButton
                    onClick={() => {
                      setCallVideoEnabled((value) => !value)
                      setCallHint('Видео-режим пока отключён: текущий SFU настроен только на audio/opus')
                    }}
                    label={callVideoEnabled ? 'Выкл. видео' : 'Вкл. видео'}
                    variant={callVideoEnabled ? 'light' : 'dark'}
                  >
                    <VideoCallIcon className="w-6 h-6" />
                  </CallActionButton>
                  <CallActionButton onClick={endCall} label="Завершить" variant="danger">
                    <PhoneIcon className="w-6 h-6 rotate-[135deg]" />
                  </CallActionButton>
                  <CallActionButton
                    onClick={() => setCallMicMuted((value) => !value)}
                    label={callMicMuted ? 'Вкл. микрофон' : 'Выкл. микрофон'}
                    variant={callMicMuted ? 'dark' : 'light'}
                  >
                    <MicIcon className="w-6 h-6" />
                  </CallActionButton>
                  <CallActionButton
                    onClick={() => setCallSoundMuted((value) => !value)}
                    label={callSoundMuted ? 'Вкл. звук' : 'Выкл. звук'}
                    variant={callSoundMuted ? 'dark' : 'light'}
                  >
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M19 5a9 9 0 0 1 0 14" />
                      <path d="M15 9a5 5 0 0 1 0 6" />
                    </svg>
                  </CallActionButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
                    {directPeerOnline ? (
                      <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-[#101822] ${directPeerStatusColor}`} />
                    ) : null}
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
      {selectedProfileUser && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-6"
          onClick={() => setSelectedProfileUser(null)}
        >
          <div
            className="w-full max-w-sm panel rounded-3xl overflow-visible shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className={`relative z-0 h-24 rounded-t-3xl overflow-hidden ${selectedProfileBackground ? 'bg-center bg-cover' : 'bg-gradient-to-r from-slate-900 to-slate-800'}`}
              style={selectedProfileBannerStyle}
            >
              {selectedProfileBackground && <div className="absolute inset-0 z-0 bg-black/35" />}
            </div>
            <div className="relative z-10 px-4 pb-4 -mt-10 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative">
                    <AvatarImage user={selectedProfileUser} size={56} src={buildAvatarUrl?.(selectedProfileUser)} />
                    {selectedProfileOnline ? (
                      <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-[#101822] ${selectedProfileStatusColor}`} />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate" style={getUserNameStyle(selectedProfileUser)}>
                      {selectedProfileUser.displayName || selectedProfileUser.username}
                    </div>
                    <div className="text-[11px] text-white/50 truncate">@{selectedProfileUser.username}</div>
                    {selectedProfileStatus && <div className="text-xs text-white/70 truncate mt-1">{selectedProfileStatus}</div>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedProfileUser(null)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 transition"
                  title="Закрыть"
                >
                  x
                </button>
              </div>
              <div className="panel rounded-2xl px-3 py-2 text-xs text-white/70 flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${selectedProfileStatusColor}`} />
                <span>{selectedProfileStatusLabel}</span>
              </div>
              <div className="panel rounded-2xl px-3 py-2 text-xs text-white/70">
                Профиль пользователя
              </div>
              <div className="panel rounded-2xl px-3 py-2 text-xs text-white/70">
                ID: {selectedProfileUser.id}
              </div>
            </div>
          </div>
        </div>
      )}

      <div ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-6 space-y-3 scroll-thin">
        {messages.map((m) => {
          const mine = m.senderId === me?.id
          const author = userMap.get(m.senderId)
          const { textSegments, attachments, voice } = extractTextAndAttachments(m.content)
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
                  <button
                    type="button"
                    className="flex items-center gap-2 hover:opacity-90 transition"
                    onClick={() => setSelectedProfileUser(author || null)}
                    disabled={!author}
                  >
                    <AvatarImage user={author} size={28} src={avatarSrc} />
                    <span style={authorStyle}>
                      {author?.displayName || nameById(m.senderId).replace(/^@/, '')}
                    </span>
                  </button>
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
                {voice && (
                  <VoiceBubble
                    src={buildMediaUrl?.(voice.url)}
                    mime={voice.mime || 'audio/webm'}
                    duration={voice.duration || 0}
                    outputDeviceId={audioOutputDeviceId}
                    fallbackServerUrl={serverUrl}
                  />
                )}
                {attachments.map((item, idx) => {
                  const mediaSrc = buildMediaUrl?.(item.url)
                  const mime = String(item?.mime || '')
                  const label = item?.name || 'Файл'
                  if (!mediaSrc) return null
                  return (
                    <ResolvedMedia
                      key={`att-${m.id}-${idx}`}
                      src={mediaSrc}
                      mime={mime}
                      label={label}
                      outputDeviceId={audioOutputDeviceId}
                      onOpen={() => {
                        const items = attachments
                          .map((a) => ({ src: buildMediaUrl?.(a.url), mime: String(a?.mime || ''), label: a?.name || 'Файл' }))
                          .filter((it) => it.src)
                        setViewerItems(items)
                        setViewerIndex(idx)
                        setViewerOpen(true)
                      }}
                    />
                  )
                })}
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
        {pendingFile && (
          <div className="mb-3 px-4 py-3 rounded-2xl bg-white/10 space-y-3">
            <div className="text-xs text-white/60 uppercase tracking-[0.15em]">Вложение перед отправкой</div>
            <div className="text-sm text-white/80 break-all">{pendingFile.name}</div>
            {pendingFileError && (
              <div className="text-sm text-red-400 break-all">{pendingFileError}</div>
            )}
            {pendingPreviewUrl && pendingFile.type?.startsWith('image/') && (
              <img src={pendingPreviewUrl} alt={pendingFile.name} className="max-w-[40rem] max-h-[60vh] object-contain rounded-xl border border-white/10" />
            )}
            {pendingPreviewUrl && pendingFile.type?.startsWith('video/') && (
              <video src={pendingPreviewUrl} controls className="max-w-[28rem] max-h-[60vh] object-contain rounded-xl border border-white/10" />
            )}
            {pendingPreviewUrl && pendingFile.type?.startsWith('audio/') && (
              <audio controls className="w-full max-w-sm">
                <source src={pendingPreviewUrl} type={pendingFile.type || 'audio/*'} />
              </audio>
            )}
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <button
                  type="button"
                  onClick={handleSendPendingFile}
                  className="tg-button tg-button--primary text-sm disabled:opacity-50 w-full"
                  disabled={sendingMedia || Boolean(pendingFileError)}
                >
                  {sendingMedia ? 'Отправка...' : 'Отправить файл'}
                </button>
                {sendingMedia && uploadProgress !== null ? (
                  <div className="mt-2">
                    <div className="h-2 w-full bg-white/10 rounded overflow-hidden">
                      <div className="h-full bg-sky-400" style={{ width: `${uploadProgress}%` }} />
                    </div>
                    <div className="text-xs text-white/60 mt-1">Загрузка: {uploadProgress}%</div>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={clearPendingFile}
                className="tg-button text-sm"
                disabled={sendingMedia}
              >
                Отмена
              </button>
            </div>
          </div>
        )}
        {recordingVoice && (
          <div className="mb-3 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-400/30 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400 animate-pulse" />
              <span className="text-red-200 font-medium">Идёт запись {formatVoiceTime(recordElapsedSec)}</span>
              <span className="text-white/60 text-xs">
                {voiceLocked ? 'Запись зафиксирована' : 'Тяните вверх для фиксации'}
              </span>
            </div>
            {voiceLocked && (
              <button
                type="button"
                onClick={() => stopVoiceRecording(true)}
                className="tg-button tg-button--primary text-xs"
                disabled={sendingMedia}
              >
                Отправить
              </button>
            )}
          </div>
        )}
        <div className="panel rounded-2xl px-4 py-2 flex items-center gap-3">
          <div className="flex items-center pb-1">
            <IconButton onClick={() => fileInputRef.current?.click()} title="Прикрепить" disabled={sendingMedia}>
              <AttachIcon />
            </IconButton>
          </div>
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
            {text.trim() ? (
              <IconButton onClick={() => handleSend()} title="Отправить" disabled={!text.trim()} variant="primary">
                <SendIcon className="w-5 h-5" />
              </IconButton>
            ) : (
              <button
                type="button"
                title={recordingVoice ? (voiceLocked ? 'Отправить голосовое' : 'Запись...') : 'Голосовое'}
                disabled={sendingMedia}
                onClick={() => {
                  if (voiceLocked && recordingVoice) stopVoiceRecording(true)
                }}
                onPointerDown={handleMicPointerDown}
                onPointerMove={handleMicPointerMove}
                onPointerUp={handleMicPointerUp}
                onPointerCancel={handleMicPointerCancel}
                className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors button-press pointer-auto no-drag ${
                  recordingVoice ? 'bg-red-500/80 text-white' : 'bg-white/5 hover:bg-white/10 text-white/90'
                } disabled:opacity-40`}
              >
                <MicIcon />
              </button>
            )}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleMediaSelect}
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.rar"
        />
      </div>
      )}
      {viewerOpen ? (
        <MediaViewer items={viewerItems} index={viewerIndex} onClose={() => setViewerOpen(false)} />
      ) : null}
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










