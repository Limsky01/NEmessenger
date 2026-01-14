import React, { useMemo, useState } from 'react'
import useStore, { buildNameStyle } from '../state/store.js'
import AvatarImage from './AvatarImage.jsx'

const roleLabel = (role) => (role === 'admin' ? 'Администратор' : 'Пользователь')

export default function AdminPanel() {
  const me = useStore((s) => s.user)
  const users = useStore((s) => s.users)
  const buildAvatarUrl = useStore((s) => s.buildAvatarUrl)
  const openChat = useStore((s) => s.openChat)
  const updateRole = useStore((s) => s.adminUpdateUserRole)
  const resetPassword = useStore((s) => s.adminResetUserPassword)
  const deleteAvatar = useStore((s) => s.adminDeleteUserAvatar)
  const deleteUser = useStore((s) => s.adminDeleteUser)

  const [status, setStatus] = useState(null)
  const [passwordDialog, setPasswordDialog] = useState(null)

  const sortedUsers = useMemo(() => {
    const list = [...users]
    return list.sort((a, b) => a.username.localeCompare(b.username, 'ru', { sensitivity: 'base' }))
  }, [users])

  const showStatus = (type, message) => {
    setStatus({ type, message })
    setTimeout(() => setStatus(null), 4000)
  }

  if (!me || me.role !== 'admin') {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center gap-4 text-white/70">
        <div className="text-lg">Недостаточно прав для просмотра админ-панели</div>
        <button
          type="button"
          onClick={openChat}
          className="tg-button"
        >
          Вернуться в чат
        </button>
      </div>
    )
  }

  const handleRoleToggle = async (user) => {
    const nextRole = user.role === 'admin' ? 'user' : 'admin'
    try {
      await updateRole(user.id, nextRole)
      showStatus('success', `Роль пользователя @${user.username} изменена на «${roleLabel(nextRole)}»`)
    } catch (err) {
      const code = err?.response?.data?.error
      if (code === 'last_admin') {
        showStatus('error', 'Нельзя снять роль с последнего администратора')
      } else if (code === 'invalid_role') {
        showStatus('error', 'Указана недопустимая роль')
      } else {
        showStatus('error', 'Не удалось обновить роль пользователя')
      }
    }
  }

  const openPasswordDialog = (user) => {
    setPasswordDialog({ user, newPassword: '', confirm: '', loading: false, error: null })
  }

  const closePasswordDialog = () => setPasswordDialog(null)

  const handlePasswordSubmit = async () => {
    if (!passwordDialog?.user) return
    const { user, newPassword, confirm } = passwordDialog
    if (!newPassword || newPassword.length < 6) {
      setPasswordDialog((state) => ({ ...state, error: 'Пароль должен быть не короче 6 символов' }))
      return
    }
    if (newPassword !== confirm) {
      setPasswordDialog((state) => ({ ...state, error: 'Пароли не совпадают' }))
      return
    }
    try {
      setPasswordDialog((state) => ({ ...state, loading: true, error: null }))
      await resetPassword(user.id, newPassword)
      showStatus('success', `Пароль для @${user.username} обновлён`)
      setPasswordDialog(null)
    } catch (err) {
      console.error(err)
      setPasswordDialog((state) => ({ ...state, loading: false, error: 'Не удалось изменить пароль пользователя' }))
    }
  }

  const handleAvatarDelete = async (user) => {
    if (!user.avatarUrl) {
      showStatus('error', 'У пользователя нет загруженного аватара')
      return
    }
    if (!window.confirm(`Удалить аватар для @${user.username}?`)) return
    try {
      await deleteAvatar(user.id)
      showStatus('success', `Аватар пользователя @${user.username} удалён`)
    } catch (err) {
      console.error(err)
      showStatus('error', 'Не удалось удалить аватар')
    }
  }

  const handleUserDelete = async (user) => {
    if (!window.confirm(`Удалить пользователя @${user.username}? Это действие необратимо.`)) return
    try {
      await deleteUser(user.id)
      showStatus('success', `Пользователь @${user.username} удалён`)
    } catch (err) {
      const code = err?.response?.data?.error || err?.message
      if (code === 'cannot_delete_self') {
        showStatus('error', 'Нельзя удалить собственную учётную запись')
      } else if (code === 'last_admin') {
        showStatus('error', 'Нельзя удалить последнего администратора')
      } else {
        console.error(err)
        showStatus('error', 'Не удалось удалить пользователя')
      }
    }
  }

  return (
    <div className="flex-1 h-full overflow-y-auto p-10 space-y-6 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-semibold">Админ-панель</div>
          <div className="text-white/60">Управление пользователями и сообщениями</div>
        </div>
        <button
          type="button"
          onClick={openChat}
          className="tg-button"
        >
          Вернуться в чат
        </button>
      </div>

      {status && (
        <div
          className={
            status.type === 'success'
              ? 'panel border border-sky-500/30 text-sky-200 px-4 py-3 rounded-2xl'
              : status.type === 'error'
              ? 'panel border border-red-500/30 text-red-300 px-4 py-3 rounded-2xl'
              : 'panel border border-white/20 text-white/80 px-4 py-3 rounded-2xl'
          }
        >
          {status.message}
        </div>
      )}

      <section className="panel rounded-3xl px-6 py-5 space-y-4">
        <div className="text-white/70 text-xs uppercase tracking-[0.25em]">Пользователи</div>
        <div className="space-y-4">
          {sortedUsers.map((user) => {
            const avatarSrc = buildAvatarUrl?.(user)
            const isMe = user.id === me.id
            const nameStyle = buildNameStyle(user?.nameStyle)
            return (
              <div key={user.id} className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 panel px-4 py-3 rounded-2xl">
                <div className="flex items-center gap-4">
                  <AvatarImage user={user} size={52} src={avatarSrc} />
                  <div className="space-y-1">
                    <div className="text-base font-medium" style={nameStyle}>{user.displayName || user.username}</div>
                    <div className="text-white/50 text-xs">ID: {user.id}</div>
                    <div className="text-white/60 text-xs">Роль: {roleLabel(user.role)}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleRoleToggle(user)}
                    className="tg-button"
                    disabled={isMe && user.role === 'admin'}
                  >
                    {user.role === 'admin' ? 'Сделать пользователем' : 'Сделать админом'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openPasswordDialog(user)}
                    className="tg-button"
                  >
                    Сменить пароль
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAvatarDelete(user)}
                    className="tg-button disabled:opacity-40"
                    disabled={!user.avatarUrl}
                  >
                    Удалить аватар
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUserDelete(user)}
                    className="px-4 py-2 rounded-2xl bg-red-500/20 hover:bg-red-500/30 text-red-200 transition disabled:opacity-40"
                    disabled={isMe}
                  >
                    Удалить пользователя
                  </button>
                </div>
              </div>
            )
          })}
          {sortedUsers.length === 0 && <div className="text-white/50 text-sm">Пользователей не найдено</div>}
        </div>
      </section>

      {passwordDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          onClick={closePasswordDialog}
        >
          <div
            className="panel max-w-md w-full rounded-3xl px-6 py-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-semibold text-white/90">
              Сменить пароль @{passwordDialog.user.username}
            </div>
            <div className="space-y-3 text-sm">
              <div className="space-y-1">
                <label className="text-white/60 text-xs uppercase tracking-[0.2em]">Новый пароль</label>
                <input
                  type="password"
                  value={passwordDialog.newPassword}
                  onChange={(e) => setPasswordDialog((state) => ({ ...state, newPassword: e.target.value }))}
                  className="tg-input"
                  placeholder="Минимум 6 символов"
                />
              </div>
              <div className="space-y-1">
                <label className="text-white/60 text-xs uppercase tracking-[0.2em]">Подтверждение</label>
                <input
                  type="password"
                  value={passwordDialog.confirm}
                  onChange={(e) => setPasswordDialog((state) => ({ ...state, confirm: e.target.value }))}
                  className="tg-input"
                  placeholder="Повторите пароль"
                />
              </div>
              {passwordDialog.error && <div className="text-red-300 text-xs">{passwordDialog.error}</div>}
            </div>
            <div className="flex items-center justify-end gap-3 text-sm">
              <button
                type="button"
                onClick={closePasswordDialog}
                className="tg-button"
                disabled={passwordDialog.loading}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handlePasswordSubmit}
                className="tg-button tg-button--primary disabled:opacity-50"
                disabled={passwordDialog.loading}
              >
                {passwordDialog.loading ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
