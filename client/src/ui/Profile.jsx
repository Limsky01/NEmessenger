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

  const roleLabel = user?.role === 'admin' ? 'Администратор' : 'Пользователь'
  const fileInputRef = useRef(null)
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [avatarStatus, setAvatarStatus] = useState(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordStatus, setPasswordStatus] = useState(null)
  const [inviteTtl, setInviteTtl] = useState('604800000')
  const [inviteActionStatus, setInviteActionStatus] = useState(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [revokeInviteId, setRevokeInviteId] = useState(null)
  const [copiedInviteId, setCopiedInviteId] = useState(null)
  const inviteStatusTimerRef = useRef(null)
  const inviteCopyTimerRef = useRef(null)

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
  }, [avatarPreview])

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

    </div>
  )
}
