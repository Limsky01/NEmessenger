import React, { useCallback, useEffect, useMemo, useState } from 'react'
import useStore, { buildNameStyle } from '../state/store.js'
import AvatarImage from './AvatarImage.jsx'
import Profile from './Profile.jsx'

export default function Settings() {
  const user = useStore((s) => s.user)
  const openChat = useStore((s) => s.openChat)
  const logout = useStore((s) => s.logout)
  const buildAvatarUrl = useStore((s) => s.buildAvatarUrl)
  const nameStyleValue = useStore((s) => s.nameStyle)

  const [autostartSupported, setAutostartSupported] = useState(false)
  const [autostartEnabled, setAutostartEnabled] = useState(false)
  const [autostartStatus, setAutostartStatus] = useState(null)
  const [autostartLoading, setAutostartLoading] = useState(false)
  const [uiScale, setUiScale] = useState(1)
  const [activeSection, setActiveSection] = useState('account')
  const [settingsSearch, setSettingsSearch] = useState('')
  const [appVersion, setAppVersion] = useState('')
  const [updateState, setUpdateState] = useState({
    status: 'idle',
    info: null,
    progress: null,
    message: null,
    reason: null,
    autoDownload: false,
  })

  const applyUpdateStatus = useCallback((incoming = {}) => {
    setUpdateState((prev) => {
      const status = incoming.status ?? prev.status ?? 'idle'
      const info = Object.prototype.hasOwnProperty.call(incoming, 'info')
        ? incoming.info
        : ['available', 'downloading', 'downloaded'].includes(status)
          ? prev.info
          : null
      const progress =
        status === 'downloading'
          ? (Object.prototype.hasOwnProperty.call(incoming, 'progress') ? incoming.progress : prev.progress)
          : null
      const message = Object.prototype.hasOwnProperty.call(incoming, 'message')
        ? incoming.message
        : status === prev.status
          ? prev.message
          : null
      const reason = Object.prototype.hasOwnProperty.call(incoming, 'reason')
        ? incoming.reason
        : status === prev.status
          ? prev.reason
          : null
      const autoDownload = Object.prototype.hasOwnProperty.call(incoming, 'autoDownload')
        ? Boolean(incoming.autoDownload)
        : prev.autoDownload ?? false
      return {
        status,
        info,
        progress,
        message,
        reason,
        autoDownload,
      }
    })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) return undefined
    let disposed = false
    const bootstrap = async () => {
      try {
        const version = await window.electronAPI.getAppVersion?.()
        if (!disposed && version) setAppVersion(version)
      } catch (err) {}
      try {
        const initialStatus = await window.electronAPI.getUpdateStatus?.()
        if (!disposed && initialStatus) applyUpdateStatus(initialStatus)
      } catch (err) {}
    }
    bootstrap()
    const unsubscribe = window.electronAPI.onUpdateStatus?.((payload) => {
      if (!disposed) applyUpdateStatus(payload)
    })
    return () => {
      disposed = true
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [applyUpdateStatus])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = window.localStorage.getItem('nemessenger:ui-scale')
      const parsed = stored ? Number.parseFloat(stored) : 1
      if (!Number.isNaN(parsed)) setUiScale(parsed)
    } catch (err) {
      console.warn('ui scale restore failed', err)
    }
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const value = Number.isFinite(uiScale) ? uiScale : 1
    document.documentElement.style.setProperty('--ui-scale', String(value))
    try {
      window.localStorage.setItem('nemessenger:ui-scale', String(value))
    } catch (err) {
      console.warn('ui scale persist failed', err)
    }
  }, [uiScale])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) return
    let mounted = true
    const loadAutostart = async () => {
      try {
        const supported = await window.electronAPI.isAutostartSupported?.()
        if (mounted) setAutostartSupported(supported !== false)
        if (!supported) return
        const enabled = await window.electronAPI.getAutostartStatus?.()
        if (mounted) setAutostartEnabled(Boolean(enabled))
      } catch (err) {
        if (mounted) {
          setAutostartStatus({ type: 'error', message: 'Не удалось получить состояние автозапуска' })
        }
      }
    }
    loadAutostart()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!autostartStatus) return undefined
    const timer = setTimeout(() => setAutostartStatus(null), 4000)
    return () => clearTimeout(timer)
  }, [autostartStatus])

  const handleToggleAutostart = async () => {
    if (typeof window === 'undefined' || !autostartSupported) return
    const api = window.electronAPI
    if (!api || typeof api.setAutostartStatus !== 'function') return
    setAutostartLoading(true)
    setAutostartStatus(null)
    try {
      const next = !autostartEnabled
      const result = await api.setAutostartStatus(next)
      const applied = Boolean(result)
      setAutostartEnabled(applied)
      setAutostartStatus({
        type: 'success',
        message: applied ? 'Автозапуск включен' : 'Автозапуск выключен',
      })
    } catch (err) {
      console.error(err)
      setAutostartStatus({ type: 'error', message: 'Не удалось изменить автозапуск' })
    } finally {
      setAutostartLoading(false)
    }
  }

  const handleCheckUpdates = async () => {
    if (typeof window === 'undefined' || !window.electronAPI?.checkForUpdates) return
    applyUpdateStatus({ status: 'checking', message: null })
    try {
      const result = await window.electronAPI.checkForUpdates()
      if (!result) return
      if (result.ok === false) {
        if (result.reason === 'development') {
          applyUpdateStatus({
            status: 'disabled',
            reason: 'development',
            message: 'Auto-update works only in packaged builds.',
          })
        } else if (result.error) {
          applyUpdateStatus({ status: 'error', message: result.error })
        }
      }
    } catch (err) {
      const message = err?.message || err || 'Could not check for updates.'
      applyUpdateStatus({ status: 'error', message })
    }
  }

  const handleDownloadUpdate = async () => {
    if (typeof window === 'undefined' || !window.electronAPI?.downloadUpdate) return
    applyUpdateStatus({ status: 'downloading' })
    try {
      const result = await window.electronAPI.downloadUpdate()
      if (result?.ok === false) {
        if (result.reason === 'development') {
          applyUpdateStatus({
            status: 'disabled',
            reason: 'development',
            message: 'Auto-update works only in packaged builds.',
          })
        } else if (result.error) {
          applyUpdateStatus({ status: 'error', message: result.error })
        }
      }
    } catch (err) {
      const message = err?.message || err || 'Failed to download update.'
      applyUpdateStatus({ status: 'error', message })
    }
  }

  const handleInstallUpdate = async () => {
    if (typeof window === 'undefined' || !window.electronAPI?.installUpdate) return
    try {
      const result = await window.electronAPI.installUpdate()
      if (result?.ok === false) {
        if (result.reason === 'development') {
          applyUpdateStatus({
            status: 'disabled',
            reason: 'development',
            message: 'Auto-update works only in packaged builds.',
          })
        } else if (result.error) {
          applyUpdateStatus({ status: 'error', message: result.error })
        }
        return
      }
      applyUpdateStatus({
        status: 'downloaded',
        message: 'Restarting to apply the update...',
      })
    } catch (err) {
      const message = err?.message || err || 'Failed to apply update.'
      applyUpdateStatus({ status: 'error', message })
    }
  }

  const updateStatus = updateState.status
  const updateInfoVersion = updateState.info?.version ?? null
  const progressPercent =
    typeof updateState.progress?.percent === 'number'
      ? Math.max(0, Math.min(100, Math.round(updateState.progress.percent)))
      : null
  const updateIsDisabled = updateStatus === 'disabled'
  const updateIsChecking = updateStatus === 'checking'
  const updateIsDownloading = updateStatus === 'downloading'
  const updateReadyToInstall = updateStatus === 'downloaded'
  const updateCanDownload = updateStatus === 'available' && !updateState.autoDownload
  let updateStatusText = 'Updates have not been checked yet.'
  let updateStatusClass = 'text-white/60'

  switch (updateStatus) {
    case 'disabled':
      updateStatusText = updateState.message || 'Auto-update works only in packaged builds.'
      updateStatusClass = 'text-white/40'
      break
    case 'checking':
      updateStatusText = 'Checking for updates...'
      updateStatusClass = 'text-white/70'
      break
    case 'available':
      updateStatusText = updateInfoVersion
        ? `Version ${updateInfoVersion} is available.` +
          (updateState.autoDownload ? ' Download will start automatically.' : '')
        : 'An update is available.'
      updateStatusClass = 'text-sky-300'
      break
    case 'downloading':
      updateStatusText = updateInfoVersion
        ? `Downloading version ${updateInfoVersion}...`
        : 'Downloading update...'
      updateStatusClass = 'text-sky-300'
      break
    case 'downloaded':
      updateStatusText =
        updateState.message ||
        (updateInfoVersion
          ? `Update ${updateInfoVersion} downloaded. Ready to install.`
          : 'Update downloaded. Ready to install.')
      updateStatusClass = 'text-sky-300'
      break
    case 'not-available':
      updateStatusText = 'You already have the latest version.'
      updateStatusClass = 'text-white/60'
      break
    case 'error':
      updateStatusText = updateState.message || 'Update failed.'
      updateStatusClass = 'text-red-300'
      break
    case 'cancelled':
      updateStatusText = 'Update download cancelled.'
      updateStatusClass = 'text-red-300'
      break
    default:
      break
  }


  const sections = useMemo(
    () => [
      { id: 'account', label: 'Моя учётная запись', group: 'user' },
      { id: 'invites', label: 'Приглашения', group: 'user' },
      { id: 'security', label: 'Пароль и безопасность', group: 'user' },
      { id: 'appearance', label: 'Внешний вид', group: 'app' },
      { id: 'system', label: 'Системные', group: 'app' },
      { id: 'updates', label: 'Обновления', group: 'app' },
      { id: 'session', label: 'Сессия', group: 'app' },
    ],
    [],
  )

  const profileSrc = user ? buildAvatarUrl?.(user) : null
  const nameStyle = buildNameStyle(nameStyleValue)
  const filteredSections = sections.filter((item) =>
    item.label.toLowerCase().includes(settingsSearch.trim().toLowerCase()),
  )

  const renderAppearance = () => (
    <section className="panel rounded-3xl px-6 py-5 space-y-4">
      <div className="text-white/70 text-xs uppercase tracking-[0.25em]">Внешний вид</div>
      <div className="space-y-4 text-sm text-white/80">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-white/80">Размер интерфейса</div>
              <div className="text-xs text-white/50">Масштабирование интерфейса приложения</div>
            </div>
            <div className="text-xs text-white/60">{Math.round(uiScale * 100)}%</div>
          </div>
          <input
            type="range"
            min="0.85"
            max="1.3"
            step="0.01"
            value={uiScale}
            onChange={(event) => setUiScale(Number(event.target.value))}
            className="w-full accent-sky-400"
          />
        </div>
      </div>
    </section>
  )

  const renderSystem = () => (
    <section className="panel rounded-3xl px-6 py-5 space-y-4">
      <div className="text-white/70 text-xs uppercase tracking-[0.25em]">Системные</div>
      <div className="space-y-4 text-sm text-white/80">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-white/80">Автозапуск</div>
            <div className="text-xs text-white/50">
              {autostartSupported
                ? 'Запускайте NE Messenger вместе с системой.'
                : 'Функция доступна в десктопном приложении.'}
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleAutostart}
            disabled={!autostartSupported || autostartLoading}
            className={`relative inline-flex h-7 w-14 items-center rounded-full border border-white/15 px-1 transition-all duration-200 ${
              autostartEnabled ? 'bg-sky-400/90 shadow-[0_0_12px_rgba(56,189,248,0.4)]' : 'bg-white/10'
            } ${(!autostartSupported || autostartLoading) ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-white/15'}`}
          >
            <span
              className={`h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ease-out ${
                autostartEnabled ? 'translate-x-7' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
        {autostartStatus && (
          <div className={autostartStatus.type === 'error' ? 'text-xs text-red-300' : 'text-xs text-sky-300'}>
            {autostartStatus.message}
          </div>
        )}
      </div>
    </section>
  )

  const renderUpdates = () => (
    <section className="panel rounded-3xl px-6 py-5 space-y-4">
      <div className="text-white/70 text-xs uppercase tracking-[0.25em]">Обновления</div>
      <div className="space-y-2 text-xs">
        <div className="text-white/60">
          Current version: <span className="text-white/80">{appVersion || '-'}</span>
        </div>
        {updateInfoVersion && (
          <div className="text-white/60">
            Latest available version: <span className="text-white/80">{updateInfoVersion}</span>
          </div>
        )}
        <div className={updateStatusClass}>{updateStatusText}</div>
      </div>
      {progressPercent !== null && (
        <div className="space-y-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-sky-400 transition-all duration-200"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="text-[10px] text-white/50">{progressPercent}%</div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleCheckUpdates}
          disabled={updateIsDisabled || updateIsChecking || updateIsDownloading}
          className={`tg-button ${
            updateIsDisabled || updateIsChecking || updateIsDownloading
              ? 'opacity-40 cursor-not-allowed'
              : ''
          }`}
        >
          {updateIsChecking ? 'Checking...' : 'Check for updates'}
        </button>
        {updateCanDownload && (
          <button
            type="button"
            onClick={handleDownloadUpdate}
            disabled={updateIsDownloading}
            className={`tg-button ${updateIsDownloading ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            {updateIsDownloading ? 'Downloading...' : 'Download update'}
          </button>
        )}
        {updateReadyToInstall && (
          <button
            type="button"
            onClick={handleInstallUpdate}
            className="tg-button tg-button--primary"
          >
            Install and restart
          </button>
        )}
      </div>
    </section>
  )

  const renderSession = () => (
    <section className="panel rounded-3xl px-6 py-5 space-y-4">
      <div className="text-white/70 text-xs uppercase tracking-[0.25em]">Сессия</div>
      <p className="text-xs text-white/50">
        Завершите текущий вход, чтобы авторизоваться под другой учетной записью или сбросить сохранённый токен.
      </p>
      <button
        type="button"
        onClick={logout}
        className="px-4 py-2 rounded-2xl bg-red-500/80 hover:bg-red-500 text-white transition"
      >
        Выйти из аккаунта
      </button>
    </section>
  )

  return (
    <div className="h-full w-full flex text-sm">
      <aside className="w-72 border-r border-white/10 bg-[#141222] p-4 space-y-4">
        <div className="flex items-center gap-3">
          <AvatarImage user={user} size={44} src={profileSrc} className="flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate" style={nameStyle}>
              {user?.displayName || user?.username || 'user'}
            </div>
            <div className="text-xs text-white/50 truncate">Редактировать профиль</div>
          </div>
        </div>
        <input
          type="search"
          value={settingsSearch}
          onChange={(event) => setSettingsSearch(event.target.value)}
          placeholder="Поиск"
          className="tg-input text-xs placeholder:text-white/40"
        />
        <div className="space-y-3">
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Настройки пользователя</div>
          <div className="space-y-1">
            {filteredSections.filter((item) => item.group === 'user').map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition ${
                  activeSection === item.id ? 'panel' : 'hover:bg-white/10'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/40 pt-2">Настройки приложения</div>
          <div className="space-y-1">
            {filteredSections.filter((item) => item.group === 'app').map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition ${
                  activeSection === item.id ? 'panel' : 'hover:bg-white/10'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </aside>
      <div className="flex-1 overflow-y-auto scroll-thin p-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-semibold">Настройки</div>
            <div className="text-white/60">Управление профилем и приложением</div>
          </div>
        </div>
        {activeSection === 'account' && (
          <Profile embedded includeInvites={false} includePassword={false} includeProfileEditor />
        )}
        {activeSection === 'invites' && (
          <Profile embedded includeInvites includePassword={false} includeProfileEditor={false} />
        )}
        {activeSection === 'security' && (
          <Profile embedded includeInvites={false} includePassword includeProfileEditor={false} />
        )}
        {activeSection === 'appearance' && renderAppearance()}
        {activeSection === 'system' && renderSystem()}
        {activeSection === 'updates' && renderUpdates()}
        {activeSection === 'session' && renderSession()}
      </div>
    </div>
  )

}
