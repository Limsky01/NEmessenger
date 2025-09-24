import React, { useMemo, useState } from 'react'
import useStore from '../state/store.js'
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
          className="px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 transition"
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

  const handlePasswordReset = async (user) => {
    const next = window.prompt(`Введите новый пароль для @${user.username} (минимум 6 символов)`) || ''
    const trimmed = next.trim()
    if (!trimmed) return
    if (trimmed.length < 6) {
      showStatus('error', 'Пароль должен быть длиной не менее 6 символов')
      return
    }
    try {
      await resetPassword(user.id, trimmed)
      showStatus('success', `Пароль для @${user.username} обновлён`)
    } catch (err) {
      showStatus('error', 'Не удалось изменить пароль пользователя')
    }
  }

  const handleAvatarDelete = async (user) => {
    if (!user.avatarUrl) {
      showStatus('error', 'У пользователя нет загруженного аватара')
      return
    }
    const confirmed = window.confirm(`Удалить аватар для @${user.username}?`)
    if (!confirmed) return
    try {
      await deleteAvatar(user.id)
      showStatus('success', `Аватар пользователя @${user.username} удалён`)
    } catch (err) {
      showStatus('error', 'Не удалось удалить аватар')
    }
  }

  const handleUserDelete = async (user) => {
    const confirmed = window.confirm(`Удалить пользователя @${user.username}? Это действие необратимо.`)
    if (!confirmed) return
    try {
      await deleteUser(user.id)
      showStatus('success', `Пользователь @${user.username} удалён`)
    } catch (err) {
      const code = err?.response?.data?.error || err?.message
      if (code === 'cannot_delete_self') {
        showStatus('error', 'Нельзя удалить собственную учетную запись')
      } else if (code === 'last_admin') {
        showStatus('error', 'Нельзя удалить последнего администратора')
      } else {
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
          className="px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 transition"
        >
          Вернуться в чат
        </button>
      </div>

      {status && (
        <div className={status.type === 'success' ? 'panel border border-emerald-500/30 text-emerald-300 px-4 py-3 rounded-2xl' : 'panel border border-red-500/30 text-red-300 px-4 py-3 rounded-2xl'}>
          {status.message}
        </div>
      )}

      <section className="panel rounded-3xl px-6 py-5 space-y-4">
        <div className="text-white/70 text-xs uppercase tracking-[0.25em]">Пользователи</div>
        <div className="space-y-4">
          {sortedUsers.map((user) => {
            const avatarSrc = buildAvatarUrl?.(user)
            const isMe = user.id === me.id
            return (
              <div key={user.id} className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 glass px-4 py-3 rounded-2xl">
                <div className="flex items-center gap-4">
                  <AvatarImage user={user} size={52} src={avatarSrc} />
                  <div className="space-y-1">
                    <div className="text-base font-medium">@{user.username}</div>
                    <div className="text-white/50 text-xs">ID: {user.id}</div>
                    <div className="text-white/60 text-xs">Роль: {roleLabel(user.role)}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleRoleToggle(user)}
                    className="px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 transition"
                    disabled={isMe && user.role === 'admin'}
                  >
                    {user.role === 'admin' ? 'Сделать пользователем' : 'Сделать админом'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePasswordReset(user)}
                    className="px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 transition"
                  >
                    Сменить пароль
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAvatarDelete(user)}
                    className="px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 transition disabled:opacity-40"
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
    </div>
  )
}
