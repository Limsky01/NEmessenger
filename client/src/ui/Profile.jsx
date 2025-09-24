import React, { useEffect, useRef, useState } from 'react'
import useStore from '../state/store.js'
import AvatarImage from './AvatarImage.jsx'

export default function Profile() {
  const user = useStore((s) => s.user)
  const openChat = useStore((s) => s.openChat)
  const updateAvatar = useStore((s) => s.updateAvatar)
  const changePassword = useStore((s) => s.changePassword)
  const buildAvatarUrl = useStore((s) => s.buildAvatarUrl)
  const audioDevices = useStore((s) => s.audioDevices)
  const audioInputDeviceId = useStore((s) => s.audioInputDeviceId)
  const audioOutputDeviceId = useStore((s) => s.audioOutputDeviceId)
  const setAudioDevice = useStore((s) => s.setAudioDevice)
  const refreshAudioDevices = useStore((s) => s.refreshAudioDevices)

  const roleLabel = user?.role === 'admin' ? 'Администратор' : 'Пользователь'
  const fileInputRef = useRef(null)
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [avatarStatus, setAvatarStatus] = useState(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordStatus, setPasswordStatus] = useState(null)
  const [deviceStatus, setDeviceStatus] = useState(null)

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
  }, [avatarPreview])

  useEffect(() => {
    refreshAudioDevices()
  }, [refreshAudioDevices])

  const handleAvatarSelect = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type?.startsWith('image/')) {
      setAvatarStatus({ type: 'error', message: 'Можно выбрать только изображение' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarStatus({ type: 'error', message: 'Размер изображения не должен превышать 5 МБ' })
      return
    }
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    setAvatarStatus(null)
  }

  const handleAvatarSubmit = async (event) => {
    event.preventDefault()
    if (!avatarFile) {
      setAvatarStatus({ type: 'error', message: 'Сначала выберите изображение' })
      return
    }
    setAvatarStatus(null)
    try {
      await updateAvatar(avatarFile)
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview)
        setAvatarPreview(null)
      }
      setAvatarFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setAvatarStatus({ type: 'success', message: 'Аватар обновлён' })
    } catch (err) {
      console.error(err)
      const code = err?.response?.data?.error
      const message =
        code === 'avatar_too_large'
          ? 'Размер изображения не должен превышать 5 МБ'
          : 'Не удалось обновить аватар'
      setAvatarStatus({ type: 'error', message })
    }
  }

  const handleAvatarReset = () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarPreview(null)
    setAvatarFile(null)
    setAvatarStatus(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

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
      setDeviceStatus({ type: 'success', message: `Обновлено. Найдено микрофонов: ${latest.inputs.length}, динамиков: ${latest.outputs.length}` })
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

  const handlePasswordSubmit = async (event) => {
    event.preventDefault()
    setPasswordStatus(null)
    if (!newPassword || newPassword.length < 6) {
      setPasswordStatus({ type: 'error', message: 'Пароль должен содержать не менее 6 символов' })
      return
    }
    try {
      await changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setPasswordStatus({ type: 'success', message: 'Пароль успешно изменён' })
    } catch (err) {
      console.error(err)
      const code = err?.response?.data?.error
      const message =
        code === 'invalid_current_password'
          ? 'Неверный текущий пароль'
          : 'Не удалось изменить пароль'
      setPasswordStatus({ type: 'error', message })
    }
  }

  if (!user) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/60">
        Профиль недоступен
      </div>
    )
  }

  const persistentAvatarSrc = buildAvatarUrl?.(user) || null
  const previewSrc = avatarPreview || persistentAvatarSrc

  return (
    <div className="flex-1 h-full overflow-y-auto p-10 space-y-8 text-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <AvatarImage user={user} size={72} src={previewSrc} />
          <div>
            <div className="text-2xl font-semibold">Профиль</div>
            <div className="text-white/60">Управление учётной записью</div>
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
        <div className="text-white/70 text-xs uppercase tracking-[0.25em]">Аккаунт</div>
        <div className="grid gap-2 text-white/80">
          <div><span className="text-white/40">Имя пользователя:</span> @{user.username}</div>
          <div><span className="text-white/40">ID:</span> {user.id}</div>
          <div><span className="text-white/40">Роль:</span> {roleLabel}</div>
        </div>
      </section>

      <section className="panel rounded-3xl px-6 py-5 space-y-4">
        <div className="text-white/70 text-xs uppercase tracking-[0.25em]">Аватар</div>
        <form onSubmit={handleAvatarSubmit} className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <AvatarImage user={user} size={108} src={previewSrc} className="flex-shrink-0" />
            <div className="space-y-2 text-white/60 text-xs sm:text-sm">
              <p>Выберите изображение в формате JPG, PNG или WEBP. Максимальный размер — 5 МБ.</p>
              {avatarFile && <p className="text-white/70 text-sm">Выбрано: {avatarFile.name}</p>}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-2xl bg-white/15 hover:bg-white/25 transition"
                >
                  Выбрать изображение
                </button>
                <button
                  type="submit"
                  disabled={!avatarFile}
                  className="px-4 py-2 rounded-2xl bg-white/20 hover:bg-white/30 transition disabled:opacity-50"
                >
                  Сохранить аватар
                </button>
                {avatarFile && (
                  <button
                    type="button"
                    onClick={handleAvatarReset}
                    className="px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 transition"
                  >
                    Отменить выбор
                  </button>
                )}
              </div>
            </div>
          </div>
          {avatarStatus && (
            <div className={avatarStatus.type === 'success' ? 'text-emerald-400 text-xs' : 'text-red-400 text-xs'}>
              {avatarStatus.message}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarSelect}
          />
        </form>
      </section>

      <section className="panel rounded-3xl px-6 py-5 space-y-4">
        <div className="text-white/70 text-xs uppercase tracking-[0.25em]">Пароль</div>
        <form onSubmit={handlePasswordSubmit} className="space-y-3">
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-2xl px-4 py-2 bg-white/10 outline-none"
            placeholder="Текущий пароль"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-2xl px-4 py-2 bg-white/10 outline-none"
            placeholder="Новый пароль"
          />
          {passwordStatus && (
            <div className={passwordStatus.type === 'success' ? 'text-emerald-400 text-xs' : 'text-red-400 text-xs'}>
              {passwordStatus.message}
            </div>
          )}
          <button
            type="submit"
            className="px-4 py-2 rounded-2xl bg-white/20 hover:bg-white/30 transition"
          >
            Сохранить пароль
          </button>
        </form>
      </section>

      <section className="panel rounded-3xl px-6 py-5 space-y-4">
        <div className="text-white/70 text-xs uppercase tracking-[0.25em]">Аудио</div>
        <div className="space-y-4 text-sm text-white/80">
          <div className="space-y-2">
            <div className="text-xs text-white/50">Входящее устройство</div>
            <select
              value={audioInputDeviceId || ''}
              onChange={(e) => setAudioDevice('input', e.target.value || null)}
              className="w-full rounded-2xl px-4 py-2 bg-white/10 outline-none"
            >
              <option value="">По умолчанию системы</option>
              {audioDevices.inputs.map((device, index) => (
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
              className="w-full rounded-2xl px-4 py-2 bg-white/10 outline-none"
            >
              <option value="">По умолчанию системы</option>
              {audioDevices.outputs.map((device, index) => (
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
            Совет: если устройства не отображаются или названы по умолчанию, разрешите доступ к микрофону в браузере и нажмите «Обновить устройства».
          </p>
        </div>
      </section>
    </div>
  )
}
