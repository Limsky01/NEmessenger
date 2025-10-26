import React, { useEffect, useRef, useState } from 'react'
import useStore from '../state/store.js'
import AvatarImage from './AvatarImage.jsx'

export default function Profile() {
  const user = useStore((s) => s.user)
  const openChat = useStore((s) => s.openChat)
  const updateAvatar = useStore((s) => s.updateAvatar)
  const changePassword = useStore((s) => s.changePassword)
  const buildAvatarUrl = useStore((s) => s.buildAvatarUrl)
  const invites = useStore((s) => s.invites) ?? []
  const fetchInvites = useStore((s) => s.fetchInvites)
  const createInvite = useStore((s) => s.createInvite)
  const revokeInvite = useStore((s) => s.revokeInvite)
  const audioDevices = useStore((s) => s.audioDevices)
  const audioInputDeviceId = useStore((s) => s.audioInputDeviceId)
  const audioOutputDeviceId = useStore((s) => s.audioOutputDeviceId)
  const setAudioDevice = useStore((s) => s.setAudioDevice)
  const refreshAudioDevices = useStore((s) => s.refreshAudioDevices)
  const logout = useStore((s) => s.logout)

  const roleLabel = user?.role === 'admin' ? 'Администратор' : 'Пользователь'
  const fileInputRef = useRef(null)
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [avatarStatus, setAvatarStatus] = useState(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordStatus, setPasswordStatus] = useState(null)
  const [deviceStatus, setDeviceStatus] = useState(null)
  const [inviteTtl, setInviteTtl] = useState('604800000')
  const [inviteActionStatus, setInviteActionStatus] = useState(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [revokeInviteId, setRevokeInviteId] = useState(null)
  const [copiedInviteId, setCopiedInviteId] = useState(null)
  const inviteStatusTimerRef = useRef(null)
  const inviteCopyTimerRef = useRef(null)
  const [autostartSupported, setAutostartSupported] = useState(false)
  const [autostartEnabled, setAutostartEnabled] = useState(false)
  const [autostartStatus, setAutostartStatus] = useState(null)
  const [autostartLoading, setAutostartLoading] = useState(false)

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
  }, [avatarPreview])

  useEffect(() => {
    refreshAudioDevices()
  }, [refreshAudioDevices])

  useEffect(() => {
    if (!user) return
    fetchInvites().catch((err) => console.error(err))
  }, [user, fetchInvites])

  useEffect(
    () => () => {
      if (inviteStatusTimerRef.current) clearTimeout(inviteStatusTimerRef.current)
      if (inviteCopyTimerRef.current) clearTimeout(inviteCopyTimerRef.current)
    },
    [],
  )

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

  const inviteStatusLabels = {
    active: 'Активен',
    claimed: 'Ожидает регистрации',
    used: 'Использован',
    expired: 'Просрочен',
    revoked: 'Отозван',
  }

  const formatInviteDate = (value) => {
    if (!value) return ''
    try {
      return new Date(value).toLocaleString('ru-RU')
    } catch (err) {
      console.error('invite date format failed', err)
      return ''
    }
  }

  const showInviteStatus = (payload) => {
    if (inviteStatusTimerRef.current) clearTimeout(inviteStatusTimerRef.current)
    setInviteActionStatus(payload)
    if (payload) {
      inviteStatusTimerRef.current = setTimeout(() => setInviteActionStatus(null), 4000)
    }
  }

  const handleCreateInvite = async () => {
    showInviteStatus(null)
    setInviteLoading(true)
    try {
      const ttlMs = parseInt(inviteTtl, 10)
      const invite = await createInvite(Number.isFinite(ttlMs) ? ttlMs : undefined)
      if (invite) {
        let message = `Создан новый код: ${invite.code}`
        try {
          if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(invite.code)
            setCopiedInviteId(invite.id)
            if (inviteCopyTimerRef.current) clearTimeout(inviteCopyTimerRef.current)
            inviteCopyTimerRef.current = setTimeout(() => setCopiedInviteId(null), 2000)
            message = `Код ${invite.code} скопирован в буфер обмена`
          }
        } catch (copyErr) {
          console.error(copyErr)
        }
        showInviteStatus({ type: 'success', message })
      }
    } catch (err) {
      console.error(err)
      showInviteStatus({ type: 'error', message: 'Не удалось создать код приглашения' })
    } finally {
      setInviteLoading(false)
    }
  }

  const handleCopyInvite = async (invite) => {
    if (!invite?.code) return
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(invite.code)
        setCopiedInviteId(invite.id)
        if (inviteCopyTimerRef.current) clearTimeout(inviteCopyTimerRef.current)
        inviteCopyTimerRef.current = setTimeout(() => setCopiedInviteId(null), 2000)
        showInviteStatus({ type: 'success', message: `Код ${invite.code} скопирован` })
      } else {
        showInviteStatus({ type: 'info', message: `Код: ${invite.code}` })
      }
    } catch (err) {
      console.error(err)
      showInviteStatus({ type: 'error', message: 'Не удалось скопировать код' })
    }
  }

  const handleRevokeInvite = async (invite) => {
    if (!invite) return
    setRevokeInviteId(invite.id)
    showInviteStatus(null)
    try {
      await revokeInvite(invite.id)
      showInviteStatus({ type: 'success', message: `Код ${invite.code} отозван` })
    } catch (err) {
      console.error(err)
      showInviteStatus({ type: 'error', message: 'Не удалось отозвать код' })
    } finally {
      setRevokeInviteId(null)
    }
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
        <div className="text-white/70 text-xs uppercase tracking-[0.25em]">Приглашения</div>
        <div className="space-y-4 text-sm">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <label className="text-xs uppercase tracking-[0.2em] text-white/50 block mb-2">Срок действия</label>
              <select
                value={inviteTtl}
                onChange={(e) => setInviteTtl(e.target.value)}
                className="w-full bg-white/5 border border-white/15 rounded-2xl px-4 py-3 outline-none focus:bg-white/10"
              >
                <option value="86400000">24 часа</option>
                <option value="604800000">7 дней</option>
                <option value="1209600000">14 дней</option>
              </select>
            </div>
            <button
              type="button"
              onClick={handleCreateInvite}
              disabled={inviteLoading}
              className="px-4 py-3 rounded-2xl bg-white/15 hover:bg-white/25 transition disabled:opacity-60"
            >
              Создать код
            </button>
          </div>
          {inviteActionStatus && (
            <div
              className={`text-center ${
                inviteActionStatus.type === 'success'
                  ? 'text-emerald-400'
                  : inviteActionStatus.type === 'error'
                  ? 'text-red-400'
                  : 'text-white/70'
              }`}
            >
              {inviteActionStatus.message}
            </div>
          )}
          <div className="space-y-3">
            {invites.length === 0 ? (
              <div className="text-white/50 text-sm">
                Кодов пока нет. Создайте первый, чтобы пригласить друзей.
              </div>
            ) : (
              invites.map((invite) => {
                const statusLabel = inviteStatusLabels[invite.status] ?? invite.status
                const expiresAt = formatInviteDate(invite.expiresAt)
                const claimedAt = invite.status === 'claimed' ? formatInviteDate(invite.claimedAt) : ''
                const usedAt = invite.status === 'used' ? formatInviteDate(invite.usedAt) : ''
                const canRevoke = invite.status === 'active' || invite.status === 'claimed'
                return (
                  <div
                    key={invite.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-4"
                  >
                    <div className="space-y-1 text-sm">
                      <div className="text-lg tracking-[0.3em] text-white/90">{invite.code}</div>
                      <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                        Статус:
                        {' '}
                        <span className="text-white/70 normal-case">{statusLabel}</span>
                      </div>
                      {expiresAt && <div className="text-white/50 text-xs">Действует до: {expiresAt}</div>}
                      {claimedAt && <div className="text-white/50 text-xs">Код зарезервирован: {claimedAt}</div>}
                      {usedAt && <div className="text-white/50 text-xs">Использован: {usedAt}</div>}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                      <button
                        type="button"
                        onClick={() => handleCopyInvite(invite)}
                        className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition text-sm disabled:opacity-60"
                      >
                        {copiedInviteId === invite.id ? 'Скопировано' : 'Скопировать'}
                      </button>
                      {canRevoke && (
                        <button
                          type="button"
                          onClick={() => handleRevokeInvite(invite)}
                          disabled={revokeInviteId === invite.id}
                          className="px-3 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 transition text-sm disabled:opacity-60"
                        >
                          Отозвать
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
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
        <div className="border-t border-white/10 pt-4 space-y-3">
          <div className="text-white/60 text-xs uppercase tracking-[0.25em]">Сессия</div>
          <p className="text-xs text-white/50">
            Завершите текущий вход, чтобы авторизоваться под другой учетной записью или сбросить сохраненный токен.
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
