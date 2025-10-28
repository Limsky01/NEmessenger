import React, { useCallback, useEffect, useState } from 'react'
import useStore from '../state/store.js'

export default function Settings() {
  const openChat = useStore((s) => s.openChat)
  const audioDevices = useStore((s) => s.audioDevices)
  const audioInputDeviceId = useStore((s) => s.audioInputDeviceId)
  const audioOutputDeviceId = useStore((s) => s.audioOutputDeviceId)
  const setAudioDevice = useStore((s) => s.setAudioDevice)
  const refreshAudioDevices = useStore((s) => s.refreshAudioDevices)
  const logout = useStore((s) => s.logout)

  const inputs = audioDevices?.inputs ?? []
  const outputs = audioDevices?.outputs ?? []

  const [deviceStatus, setDeviceStatus] = useState(null)
  const [autostartSupported, setAutostartSupported] = useState(false)
  const [autostartEnabled, setAutostartEnabled] = useState(false)
  const [autostartStatus, setAutostartStatus] = useState(null)
  const [autostartLoading, setAutostartLoading] = useState(false)
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
    refreshAudioDevices()
  }, [refreshAudioDevices])

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

  const handleRefreshDevices = async () => {
    if (!navigator?.mediaDevices) {
      setDeviceStatus({ type: 'error', message: 'Браузер не поддерживает работу с устройствами' })
      setTimeout(() => setDeviceStatus(null), 4000)
      return
    }
    setDeviceStatus({ type: 'info', message: 'Обновление списка устройств...' })
    try {
      await refreshAudioDevices()
      let latest = useStore.getState().audioDevices
      if (!latest.inputs.length) {
        await navigator.mediaDevices.getUserMedia({ audio: true })
        await refreshAudioDevices()
        latest = useStore.getState().audioDevices
      }
      setDeviceStatus({
        type: 'success',
        message: `Обновлено. Найдено микрофонов: ${latest.inputs.length}, динамиков: ${latest.outputs.length}`,
      })
    } catch (err) {
      console.error(err)
      setDeviceStatus({ type: 'error', message: 'Не удалось получить список устройств. Разрешите доступ к микрофону.' })
    } finally {
      setTimeout(() => setDeviceStatus(null), 4000)
    }
  }

  const handleTestMicrophone = async () => {
    if (!navigator?.mediaDevices?.getUserMedia) {
      setDeviceStatus({ type: 'error', message: 'Доступ к микрофону не поддерживается' })
      setTimeout(() => setDeviceStatus(null), 4000)
      return
    }
    setDeviceStatus({ type: 'info', message: 'Запрос доступа к микрофону...' })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      await refreshAudioDevices()
      setDeviceStatus({ type: 'success', message: 'Микрофон доступен и готов к использованию' })
    } catch (err) {
      console.error(err)
      setDeviceStatus({ type: 'error', message: 'Не удалось получить доступ к микрофону' })
    } finally {
      setTimeout(() => setDeviceStatus(null), 4000)
    }
  }

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
      updateStatusClass = 'text-emerald-300'
      break
    case 'downloading':
      updateStatusText = updateInfoVersion
        ? `Downloading version ${updateInfoVersion}...`
        : 'Downloading update...'
      updateStatusClass = 'text-emerald-300'
      break
    case 'downloaded':
      updateStatusText =
        updateState.message ||
        (updateInfoVersion
          ? `Update ${updateInfoVersion} downloaded. Ready to install.`
          : 'Update downloaded. Ready to install.')
      updateStatusClass = 'text-emerald-300'
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


  return (
    <div className="flex-1 h-full overflow-y-auto p-10 space-y-8 text-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-2xl">⚙</div>
          <div>
            <div className="text-2xl font-semibold">Настройки</div>
            <div className="text-white/60">Управляйте оборудованием и приложением</div>
          </div>
        </div>
        <button
          type="button"
          onClick={openChat}
          className="px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 transition"
        >
          Вернуться в чат
        </button>
      </div>

      <section className="panel rounded-3xl px-6 py-5 space-y-4">
        <div className="text-white/70 text-xs uppercase tracking-[0.25em]">Аудио</div>
        <div className="space-y-4 text-sm text-white/80">
          <div className="space-y-2">
            <div className="text-xs text-white/50">Входное устройство</div>
            <select
              value={audioInputDeviceId || ''}
              onChange={(e) => setAudioDevice('input', e.target.value || null)}
              className="settings-select w-full rounded-2xl px-4 py-2 bg-white/10 text-white outline-none focus:bg-white/15 focus:text-white"
            >
              <option value="">По умолчанию системы</option>
              {inputs.map((device, index) => (
                <option key={device.deviceId || index} value={device.deviceId}>
                  {device.label || `Микрофон ${index + 1}`}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <div className="text-xs text-white/50">Выходное устройство</div>
            <select
              value={audioOutputDeviceId || ''}
              onChange={(e) => setAudioDevice('output', e.target.value || null)}
              className="settings-select w-full rounded-2xl px-4 py-2 bg-white/10 text-white outline-none focus:bg-white/15 focus:text-white"
            >
              <option value="">По умолчанию системы</option>
              {outputs.map((device, index) => (
                <option key={device.deviceId || index} value={device.deviceId}>
                  {device.label || `Динамики ${index + 1}`}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRefreshDevices}
              className="px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 transition"
            >
              Обновить устройства
            </button>
            <button
              type="button"
              onClick={handleTestMicrophone}
              className="px-4 py-2 rounded-2xl bg-white/5 hover:bg-white/15 transition"
            >
              Проверить микрофон
            </button>
          </div>
          {deviceStatus && (
            <div className={deviceStatus.type === 'error' ? 'text-red-300 text-xs' : deviceStatus.type === 'success' ? 'text-emerald-300 text-xs' : 'text-white/60 text-xs'}>
              {deviceStatus.message}
            </div>
          )}
          <p className="text-xs text-white/50">
            Совет: если устройства не отображаются или названы по умолчанию, разрешите доступ к микрофону в браузере и нажмите
            «Обновить устройства».
          </p>
        </div>
      </section>

      <section className="panel rounded-3xl px-6 py-5 space-y-4">
        <div className="text-white/70 text-xs uppercase tracking-[0.25em]">Приложение</div>
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
                autostartEnabled ? 'bg-emerald-400/90 shadow-[0_0_12px_rgba(16,185,129,0.45)]' : 'bg-white/10'
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
            <div className={autostartStatus.type === 'error' ? 'text-xs text-red-300' : 'text-xs text-emerald-300'}>
              {autostartStatus.message}
            </div>
          )}
        </div>
        <div className="border-t border-white/10 pt-4 space-y-4">
          <div className="text-white/60 text-xs uppercase tracking-[0.25em]">Updates</div>
          <div className="space-y-2 text-xs">
            <div className="text-white/60">
              Current version: <span className="text-white/80">{appVersion || '—'}</span>
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
                  className="h-full bg-emerald-400 transition-all duration-200"
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
              className={`px-4 py-2 rounded-2xl bg-white/10 transition ${
                updateIsDisabled || updateIsChecking || updateIsDownloading
                  ? 'opacity-40 cursor-not-allowed'
                  : 'hover:bg-white/20'
              }`}
            >
              {updateIsChecking ? 'Checking...' : 'Check for updates'}
            </button>
            {updateCanDownload && (
              <button
                type="button"
                onClick={handleDownloadUpdate}
                disabled={updateIsDownloading}
                className={`px-4 py-2 rounded-2xl bg-white/10 transition ${
                  updateIsDownloading ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/20'
                }`}
              >
                {updateIsDownloading ? 'Downloading...' : 'Download update'}
              </button>
            )}
            {updateReadyToInstall && (
              <button
                type="button"
                onClick={handleInstallUpdate}
                className="px-4 py-2 rounded-2xl bg-emerald-500/80 hover:bg-emerald-500 text-white transition"
              >
                Install and restart
              </button>
            )}
          </div>
        </div>
        <div className="border-t border-white/10 pt-4 space-y-3">
          <div className="text-white/60 text-xs uppercase tracking-[0.25em]">Сессия</div>
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
        </div>
      </section>
    </div>
  )
}
