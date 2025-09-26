import React, { useEffect, useMemo, useState } from 'react'
import Titlebar from './Titlebar.jsx'
import Sidebar from './Sidebar.jsx'
import Chat from './Chat.jsx'
import Login from './Login.jsx'
import Profile from './Profile.jsx'
import AdminPanel from './AdminPanel.jsx'
import useStore from '../state/store.js'
import SplashScreen from './SplashScreen.jsx'

function VoiceAudioLayer() {
  const remoteStreams = useStore((s) => s.voiceRemoteStreams)
  const audioOutputDeviceId = useStore((s) => s.audioOutputDeviceId)
  const refs = React.useRef({})

  React.useEffect(() => {
    const ids = new Set(Object.keys(remoteStreams))
    Object.keys(refs.current).forEach((id) => {
      if (!ids.has(id)) delete refs.current[id]
    })
  }, [remoteStreams])

  React.useEffect(() => {
    const sinkId = audioOutputDeviceId || 'default'
    Object.entries(refs.current).forEach(([id, element]) => {
      if (!element) return
      const info = remoteStreams[id]
      if (info?.stream && element.srcObject !== info.stream) {
        element.srcObject = info.stream
      }
      if (typeof element.setSinkId === 'function') {
        element
          .setSinkId(sinkId)
          .catch((err) => console.warn('setSinkId failed', err))
      }
    })
  }, [remoteStreams, audioOutputDeviceId])

  return (
    <div style={{ display: 'none' }}>
      {Object.entries(remoteStreams).map(([socketId, info]) => (
        <audio
          key={socketId}
          ref={(node) => {
            refs.current[socketId] = node
            if (node && info?.stream && node.srcObject !== info.stream) {
              node.srcObject = info.stream
            }
          }}
          autoPlay
          playsInline
        />
      ))}
    </div>
  )
}

export default function App() {
  const token = useStore((s) => s.token)
  const connect = useStore((s) => s.connect)
  const view = useStore((s) => s.view)
  const socketConnected = useStore((s) => s.socket?.connected ?? false)
  const connectionStatus = useStore((s) => s.connectionStatus)
  const retrySecondsRemaining = useStore((s) => s.retrySecondsRemaining)
  const retryDelay = useStore((s) => s.retryDelay)
  const connectionError = useStore((s) => s.connectionError)
  const triggerReconnectNow = useStore((s) => s.triggerReconnectNow)
  const [showSplash, setShowSplash] = useState(true)
  const [minimumVisible, setMinimumVisible] = useState(false)

  useEffect(() => {
    if (token) connect()
  }, [token, connect])

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
    <div className="h-full w-full app-bg font-mc">
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
            {view === 'profile' ? <Profile /> : view === 'admin' ? <AdminPanel /> : <Chat />}
          </div>
        ) : (
          <Login />
        )}
      </div>
      <VoiceAudioLayer />
    </div>
  )
}


