import React, { useEffect, useMemo, useState } from 'react'
import Titlebar from './Titlebar.jsx'
import Sidebar from './Sidebar.jsx'
import Chat from './Chat.jsx'
import Login from './Login.jsx'
import Profile from './Profile.jsx'
import AdminPanel from './AdminPanel.jsx'
import Settings from './Settings.jsx'
import useStore from '../state/store.js'
import SplashScreen from './SplashScreen.jsx'

function AppInner() {
  const token = useStore((s) => s.token)
  const connect = useStore((s) => s.connect)
  const view = useStore((s) => s.view)
  const socketConnected = useStore((s) => s.socket?.connected ?? false)
  const connectionStatus = useStore((s) => s.connectionStatus)
  const retrySecondsRemaining = useStore((s) => s.retrySecondsRemaining)
  const retryDelay = useStore((s) => s.retryDelay)
  const connectionError = useStore((s) => s.connectionError)
  const triggerReconnectNow = useStore((s) => s.triggerReconnectNow)
  const fetchFriends = useStore((s) => s.fetchFriends)
  const fetchFriendRequests = useStore((s) => s.fetchFriendRequests)
  const openChat = useStore((s) => s.openChat)
  const [showSplash, setShowSplash] = useState(true)
  const [minimumVisible, setMinimumVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = window.localStorage.getItem('nemessenger:ui-scale')
      if (stored) document.documentElement.style.setProperty('--ui-scale', stored)
    } catch (err) {
      console.warn('ui scale restore failed', err)
    }
  }, [])

  useEffect(() => {
    if (token) connect()
  }, [token, connect])

  useEffect(() => {
    if (!token) return
    fetchFriends().catch((err) => console.warn('fetch friends failed', err))
    fetchFriendRequests().catch((err) => console.warn('fetch friend requests failed', err))
  }, [token, fetchFriends, fetchFriendRequests])

  useEffect(() => {
    if (!token) return
    if (!showSplash && ['connecting', 'retrying', 'awaiting_manual'].includes(connectionStatus)) {
      setShowSplash(true)
    }
  }, [token, connectionStatus, showSplash])

  useEffect(() => {
    if (!showSplash) return undefined
    setMinimumVisible(false)
    const timeout = setTimeout(() => setMinimumVisible(true), 900)
    return () => clearTimeout(timeout)
  }, [showSplash])

  useEffect(() => {
    if (!showSplash || !minimumVisible) return
    if (!token) {
      setShowSplash(false)
      return
    }
    if (['retrying', 'awaiting_manual', 'connecting'].includes(connectionStatus)) {
      return
    }
    if (socketConnected && connectionStatus === 'connected') {
      const delay = setTimeout(() => setShowSplash(false), 250)
      return () => clearTimeout(delay)
    }
  }, [minimumVisible, showSplash, token, socketConnected, connectionStatus])

  const splashSubheading = useMemo(() => {
    if (!token) return 'Подготовка формы входа…'
    if (connectionStatus === 'retrying') return 'Пытаемся восстановить соединение…'
    if (connectionStatus === 'awaiting_manual') return 'Соединение потеряно'
    if (connectionStatus === 'connecting' || !socketConnected)
      return 'Подключаемся к серверу и загружаем рабочие пространства…'
    return 'Почти готово!'
  }, [token, socketConnected, connectionStatus])

  const countdownSeconds = useMemo(() => {
    if (typeof retrySecondsRemaining === 'number') return Math.max(0, retrySecondsRemaining)
    if (typeof retryDelay === 'number') return Math.max(0, Math.ceil(retryDelay / 1000))
    return null
  }, [retrySecondsRemaining, retryDelay])

  const splashStatusText = useMemo(() => {
    if (!token) return null
    if (connectionStatus === 'retrying') {
      if (countdownSeconds !== null) {
        const seconds = Math.max(1, countdownSeconds)
        return `Нет соединения. Переподключение через ${seconds} сек.`
      }
      return 'Нет соединения. Пытаемся переподключиться…'
    }
    if (connectionStatus === 'awaiting_manual') {
      const base = 'Нет соединения. Попробуйте переподключиться вручную.'
      if (!connectionError) return base
      const normalizedError = String(connectionError).trim()
      if (!normalizedError.length) return base
      return `${base} (${normalizedError})`
    }
    return null
  }, [token, connectionStatus, countdownSeconds, connectionError])

  const manualActionLabel = connectionStatus === 'awaiting_manual' ? 'Подключиться сейчас' : undefined
  return (
    <div className="h-full w-full app-bg">
      <SplashScreen
        showSplash={showSplash}
        heading={token ? 'Секунду…' : 'Добро пожаловать'}
        subheading={splashSubheading}
        statusText={splashStatusText}
        secondaryActionLabel={manualActionLabel}
        onSecondaryAction={manualActionLabel ? triggerReconnectNow : undefined}
      />

      <div className="h-full w-full overflow-hidden relative">
        <Titlebar />
        {token ? (
          <div className="flex h-[calc(100%-48px)]">
            <Sidebar />
            {view === 'admin' ? <AdminPanel /> : <Chat />}
          </div>
        ) : (
          <Login />
        )}
      </div>

      {token && (view === 'profile' || view === 'settings') && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-6">
          <div className="w-full max-w-5xl panel rounded-3xl overflow-hidden relative max-h-[92vh] h-[92vh]">
            <button
              type="button"
              onClick={openChat}
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 transition z-10"
              title="Закрыть"
            >
              ✕
            </button>
            <div className="h-full overflow-y-auto scroll-thin">
              {view === 'profile' ? <Profile /> : <Settings />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  // DIAGNOSTICS: notifications are global only
  return <AppInner />
}









