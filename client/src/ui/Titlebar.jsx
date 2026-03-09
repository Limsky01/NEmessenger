import React, { useEffect, useMemo, useState } from 'react'
import useStore from '../state/store.js'

const api = typeof window !== 'undefined' ? window.electronAPI : undefined

const baseBtn = 'w-8 h-8 rounded-lg flex items-center justify-center transition button-press pointer-auto no-drag border border-white/10'
const hoverMap = {
  default: ' bg-white/5 hover:bg-white/10',
  danger: ' bg-white/5 hover:bg-red-500/80',
}

function TitleButton({ onClick, title, children, variant = 'default', disabled }) {
  return (
    <button
      type="button"
      className={`${baseBtn}${hoverMap[variant]}`}
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

function MinimizeIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
      <line x1="2" x2="10" y1="6" y2="6" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <line x1="2" y1="2" x2="10" y2="10" />
      <line x1="10" y1="2" x2="2" y2="10" />
    </svg>
  )
}

function MaximizeIcon({ isMaximized }) {
  if (isMaximized) {
    return (
      <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M3 4.5h4.5V9" />
        <path d="M6.5 3H3v4.5" />
      </svg>
    )
  }
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2.5" y="2.5" width="7" height="7" />
    </svg>
  )
}

export default function Titlebar() {
  const [windowState, setWindowState] = useState({ maximized: false, fullscreen: false })
  const token = useStore((s) => s.token)
  const me = useStore((s) => s.user)
  const view = useStore((s) => s.view)
  const socketConnected = useStore((s) => s.socket?.connected ?? false)
  const connectionStatus = useStore((s) => s.connectionStatus)
  const serverUrl = useStore((s) => s.serverUrl)
  const setServerUrl = useStore((s) => s.setServerUrl)
  const openAdmin = useStore((s) => s.openAdmin)
  const triggerReconnectNow = useStore((s) => s.triggerReconnectNow)
  const serverModalOpen = useStore((s) => s.serverModalOpen)
  const openServerModal = useStore((s) => s.openServerModal)
  const closeServerModal = useStore((s) => s.closeServerModal)
  const noclickStyle = useMemo(() => ({ WebkitAppRegion: 'no-drag' }), [])
  const [serverDraft, setServerDraft] = useState('')
  const [serverError, setServerError] = useState('')
  const [serverSaving, setServerSaving] = useState(false)

  const connectionLabel = useMemo(() => {
    if (!token) return 'Нет входа'
    if (connectionStatus === 'connected' && socketConnected) return 'В сети'
    if (connectionStatus === 'retrying') return 'Переподключение'
    if (connectionStatus === 'awaiting_manual') return 'Нет соединения'
    return 'Подключение'
  }, [token, connectionStatus, socketConnected])

  const connectionDotClass = useMemo(() => {
    if (!token) return 'bg-white/30'
    if (connectionStatus === 'connected' && socketConnected) return 'bg-emerald-400'
    if (connectionStatus === 'retrying') return 'bg-yellow-400'
    if (connectionStatus === 'awaiting_manual') return 'bg-red-500'
    return 'bg-sky-400'
  }, [token, connectionStatus, socketConnected])

  const canConfigureServer = !token || connectionStatus !== 'connected' || !socketConnected

  useEffect(() => {
    if (!serverModalOpen) return
    setServerDraft(serverUrl || '')
    setServerError('')
  }, [serverModalOpen, serverUrl])

  useEffect(() => {
    if (serverModalOpen && connectionStatus === 'connected' && socketConnected) {
      closeServerModal()
    }
  }, [serverModalOpen, connectionStatus, socketConnected, closeServerModal])

  const handleStatusClick = () => {
    if (canConfigureServer) {
      openServerModal()
      return
    }
    if (token && connectionStatus === 'connected' && socketConnected) {
      openAdmin()
    }
  }

  const handleSaveServer = async () => {
    if (serverSaving) return
    setServerSaving(true)
    setServerError('')
    const ok = setServerUrl(serverDraft, { reconnect: true })
    if (!ok) {
      setServerError('Введите адрес сервера')
      setServerSaving(false)
      return
    }
    const normalized = serverDraft.startsWith('http://') || serverDraft.startsWith('https://')
      ? serverDraft
      : `http://${serverDraft}`
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)
      try {
        const response = await fetch(`${normalized}/api/users`, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!(response.status === 200 || response.status === 401 || response.status === 403)) {
          throw new Error(`HTTP ${response.status}`)
        }
      } finally {
        clearTimeout(timer)
      }
    } catch (err) {
      const message = err?.name === 'AbortError' ? 'Таймаут 5с. Сервер недоступен.' : `Нет доступа к серверу: ${err?.message || 'network error'}`
      setServerError(message)
      setServerSaving(false)
      return
    }
    triggerReconnectNow()
    closeServerModal()
    setServerSaving(false)
  }

  useEffect(() => {
    if (!api) return undefined
    let unsubscribe
    api.getWindowState?.().then((state) => state && setWindowState(state))
    if (api.onWindowState) {
      unsubscribe = api.onWindowState((state) => setWindowState(state))
    }
    return () => unsubscribe?.()
  }, [])

  const handleMinimize = () => {
    if (api?.minimize) api.minimize()
    else window.blur()
  }

  const handleToggleFullscreen = () => {
    if (api?.toggleMaximize) {
      api.toggleMaximize()
      return
    }
    if (document.fullscreenElement) {
      document.exitFullscreen?.()
    } else {
      document.documentElement.requestFullscreen?.()
    }
  }

  const handleClose = () => {
    if (api?.close) api.close()
    else window.close()
  }

  const isExpanded = windowState.maximized || windowState.fullscreen

  const handleMouseDown = (event) => {
    if (event.button !== 0) return
    if (event.target.closest?.('.no-drag')) return
    if (!api?.beginDrag) return
    const screenX = window.screenX + event.clientX
    const screenY = window.screenY + event.clientY
    api.beginDrag({ screenX, screenY })
  }

  return (
    <div
      className="drag h-12 px-4 flex items-center justify-between tg-topbar"
      onMouseDown={handleMouseDown}
      onDoubleClick={(event) => {
        event.preventDefault()
        handleToggleFullscreen()
      }}
    >
      <div className="flex items-center gap-3">
        <div className="text-sm tracking-widest opacity-90 select-none">NE Messenger</div>
      </div>
      <div className="flex-1 flex items-center justify-center px-4">
        <button
          type="button"
          onClick={handleStatusClick}
          className={`no-drag inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${
            view === 'admin'
              ? 'bg-sky-400/20 border-sky-300/60 text-sky-100'
              : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/70'
          }`}
          title={
            canConfigureServer
              ? 'Открыть настройки сервера'
              : me?.role === 'admin'
              ? 'Открыть админ-панель'
              : 'Статус подключения'
          }
        >
          <span className={`w-2 h-2 rounded-full ${connectionDotClass}`} />
          <span>{connectionLabel}</span>
          {!canConfigureServer && me?.role === 'admin' && (
            <span className="text-[10px] uppercase tracking-[0.2em] text-sky-200/90">Admin</span>
          )}
        </button>
      </div>
      <div className="flex gap-2 pointer-auto" style={noclickStyle}>
        <TitleButton onClick={handleMinimize} title="Свернуть">
          <MinimizeIcon />
        </TitleButton>
        <TitleButton onClick={handleToggleFullscreen} title={isExpanded ? 'Вернуть окно' : 'Развернуть'}>
          <MaximizeIcon isMaximized={isExpanded} />
        </TitleButton>
        <TitleButton onClick={handleClose} title="Закрыть" variant="danger">
          <CloseIcon />
        </TitleButton>
      </div>
      {serverModalOpen && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-6"
          onClick={closeServerModal}
        >
          <div className="panel w-full max-w-md rounded-3xl overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <div className="text-lg font-semibold text-white/90">Адрес сервера</div>
                <div className="text-xs text-white/60">Укажите сервер разработчика для подключения</div>
              </div>
              <button
                type="button"
                onClick={closeServerModal}
                className="text-white/40 hover:text-white/80 transition"
              >
                x
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <input
                value={serverDraft}
                onChange={(event) => setServerDraft(event.target.value)}
                placeholder="http://192.168.0.10:4000"
                className="tg-input text-sm placeholder:text-white/40"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleSaveServer()
                  }
                }}
              />
              {serverError && <div className="text-xs text-red-300">{serverError}</div>}
            </div>
            <div className="px-5 py-4 border-t border-white/10 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeServerModal}
                className="tg-button text-sm"
                disabled={serverSaving}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleSaveServer}
                className="tg-button tg-button--primary text-sm disabled:opacity-50"
                disabled={serverSaving}
              >
                {serverSaving ? 'Проверка...' : 'Подключить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
