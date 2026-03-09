import React, { useEffect, useState } from 'react'
import axios from 'axios'
import useStore from '../state/store.js'

const REMEMBER_LOGIN_STORAGE_KEY = 'nemessenger:remember-login'

const formatDateTime = (timestamp) => {
  if (!timestamp) return ''
  try {
    return new Date(timestamp).toLocaleString('ru-RU')
  } catch (err) {
    console.warn('date format failed', err)
    return ''
  }
}

export default function Login() {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [inviteCodeInput, setInviteCodeInput] = useState('')
  const [inviteInfo, setInviteInfo] = useState(null)
  const [status, setStatus] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [rememberLogin, setRememberLogin] = useState(() => {
    if (typeof window === 'undefined') return true
    try {
      const value = window.localStorage.getItem(REMEMBER_LOGIN_STORAGE_KEY)
      if (value === 'false') return false
      if (value === 'true') return true
      return true
    } catch (err) {
      return true
    }
  })
  const setAuth = useStore((s) => s.setAuth)
  const server = useStore((s) => s.serverUrl)

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
  }, [avatarPreview])

  useEffect(() => {
    setStatus(null)
  }, [mode])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(REMEMBER_LOGIN_STORAGE_KEY, rememberLogin ? 'true' : 'false')
    } catch (err) {
      // ignore storage failures
    }
  }, [rememberLogin])

  const resetAvatar = () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarPreview(null)
    setAvatarFile(null)
  }

  const resetForms = () => {
    setUsername('')
    setPassword('')
    setPasswordConfirm('')
    setInviteCodeInput('')
    setInviteInfo(null)
    resetAvatar()
    setProcessing(false)
    setStatus(null)
  }

  const goToLogin = () => {
    resetForms()
    setMode('login')
  }

  const handleLoginSubmit = async (event) => {
    event.preventDefault()
    setStatus(null)
    setProcessing(true)
    try {
      const { data } = await axios.post(server + '/api/login', { username, password })
      setAuth(data.accessToken, data.user, { persist: rememberLogin, refreshToken: data.refreshToken })
    } catch (err) {
      console.error(err)
      const error = err?.response?.data?.error
      const message = (() => {
        if (err?.response?.status === 401 || error === 'invalid_credentials') return 'Неверный логин или пароль'
        return 'Не удалось выполнить вход'
      })()
      setStatus(message)
    } finally {
      setProcessing(false)
    }
  }

  const handleInviteSubmit = async (event) => {
    event.preventDefault()
    const code = inviteCodeInput.trim()
    if (!code) {
      setStatus('Введите код приглашения')
      return
    }
    setProcessing(true)
    setStatus(null)
    try {
      const { data } = await axios.post(server + '/api/invites/claim', { code })
      const info = {
        code: data?.invite?.code || code.toUpperCase(),
        claimToken: data?.claimToken || '',
        expiresAt: data?.invite?.expiresAt || 0,
        createdBy: data?.invite?.createdBy || null,
      }
      setInviteInfo(info)
      setInviteCodeInput(info.code)
      setMode('register')
      setStatus('Код подтверждён. Заполните форму регистрации.')
    } catch (err) {
      console.error(err)
      const error = err?.response?.data?.error
      const message = (() => {
        if (error === 'invalid_code') return 'Код не найден'
        if (error === 'invite_expired') return 'Срок действия кода истёк'
        if (error === 'invite_used') return 'Код уже использован'
        if (error === 'invite_revoked') return 'Код был отозван'
        return 'Не удалось проверить код'
      })()
      setStatus(message)
    } finally {
      setProcessing(false)
    }
  }

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type?.startsWith('image/')) {
      setStatus('Можно загрузить только изображение')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setStatus('Аватар не должен превышать 5 МБ')
      return
    }
    resetAvatar()
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    setStatus(null)
  }

  const handleRegisterSubmit = async (event) => {
    event.preventDefault()
    if (!inviteInfo?.claimToken || !inviteInfo?.code) {
      setStatus('Сначала подтвердите код приглашения')
      return
    }
    const trimmedUsername = username.trim()
    if (!trimmedUsername) {
      setStatus('Введите имя пользователя')
      return
    }
    if (!password || password.length < 6) {
      setStatus('Пароль должен содержать минимум 6 символов')
      return
    }
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
      setStatus('Пароль должен содержать строчные и заглавные буквы')
      return
    }
    if (password !== passwordConfirm) {
      setStatus('Пароли не совпадают')
      return
    }
    setProcessing(true)
    setStatus(null)
    try {
      const payload = {
        username: trimmedUsername,
        password,
        inviteCode: inviteInfo.code,
        inviteClaimToken: inviteInfo.claimToken,
      }
      const { data } = await axios.post(server + '/api/register', payload)
      setAuth(data.accessToken, data.user, { persist: rememberLogin, refreshToken: data.refreshToken })
      if (avatarFile) {
        try {
          const form = new FormData()
          form.append('avatar', avatarFile)
          const headers = { Authorization: `Bearer ${data.accessToken}` }
          const endpoint = server.endsWith('/') ? server + 'api/profile/avatar' : server + '/api/profile/avatar'
          const avatarResponse = await axios.post(endpoint, form, { headers })
          if (avatarResponse?.data?.user) {
            setAuth(data.accessToken, avatarResponse.data.user, { persist: rememberLogin, refreshToken: data.refreshToken })
          }
        } catch (avatarErr) {
          console.error(avatarErr)
        }
      }
    } catch (err) {
      console.error(err)
      const error = err?.response?.data?.error
      const message = (() => {
        switch (error) {
          case 'username_taken':
            return 'Такой логин уже используется'
          case 'weak_password':
            return 'Пароль должен содержать минимум 6 символов, строчные и заглавные буквы'
          case 'invite_expired':
            return 'Срок действия кода истёк'
          case 'invite_used':
            return 'Код уже использован'
          case 'invite_revoked':
            return 'Код был отозван'
          case 'invite_claim_invalid':
            return 'Проверка кода не пройдена, попробуйте снова'
          default:
            break
        }
        if (error === 'invite_required' || error === 'invalid_invite') {
          return 'Для регистрации нужен действующий код приглашения'
        }
        return 'Не удалось завершить регистрацию'
      })()
      setStatus(message)
    } finally {
      setProcessing(false)
    }
  }

  const renderLogin = () => (
    <form onSubmit={handleLoginSubmit} className="space-y-4">
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Имя пользователя"
        className="tg-input"
        autoComplete="username"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Пароль"
        className="tg-input"
        autoComplete="current-password"
      />
      <label className="flex items-center gap-2 text-sm text-white/70 select-none">
        <input
          type="checkbox"
          className="w-4 h-4 accent-sky-400 rounded"
          checked={rememberLogin}
          onChange={(e) => setRememberLogin(e.target.checked)}
        />
        <span>Запомнить вход</span>
      </label>
      {status && <div className="text-sm text-red-400 text-center">{status}</div>}
      <button
        className="w-full tg-button tg-button--primary py-3 disabled:opacity-60"
        disabled={processing}
      >
        Войти
      </button>
      <div className="text-sm text-white/70 text-center space-y-2">
        <div>
          Новый пользователь?
          {' '}
          <button type="button" onClick={() => setMode('invite')} className="underline">
            У меня есть код приглашения
          </button>
        </div>
      </div>
    </form>
  )

  const renderInvite = () => (
    <form onSubmit={handleInviteSubmit} className="space-y-4">
      <div className="text-white/80 text-center">Введите полученный код приглашения</div>
      <input
        value={inviteCodeInput}
        onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
        placeholder="Например, A1B2C3D4"
        className="tg-input uppercase tracking-[0.3em] text-center text-lg"
      />
      {status && <div className="text-sm text-red-400 text-center">{status}</div>}
      <button
        className="w-full tg-button tg-button--primary py-3 disabled:opacity-60"
        disabled={processing}
      >
        Проверить код
      </button>
      <div className="text-sm text-white/60 text-center">
        <button type="button" onClick={goToLogin} className="underline">
          Вернуться к входу
        </button>
      </div>
    </form>
  )

  const renderRegister = () => {
    const expiresAt = inviteInfo?.expiresAt ? formatDateTime(inviteInfo.expiresAt) : null
    const inviter = inviteInfo?.createdBy?.username
    return (
      <form onSubmit={handleRegisterSubmit} className="space-y-4">
        <div className="space-y-2 text-sm text-white/70">
          <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
            <div>
              <div className="uppercase text-xs tracking-[0.3em] text-white/40">Код</div>
              <div className="text-lg tracking-[0.25em] text-white/90">{inviteInfo?.code}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                setInviteInfo(null)
                setInviteCodeInput('')
                setMode('invite')
              }}
              className="text-xs underline text-white/60"
            >
              Изменить код
            </button>
          </div>
          {inviter && <div>Пригласил: <span className="text-white/90">{inviter}</span></div>}
          {expiresAt && <div>Действует до: <span className="text-white/90">{expiresAt}</span></div>}
        </div>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Имя пользователя"
          className="tg-input"
          autoComplete="username"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Пароль (мин. 6 символов, a-z и A-Z)"
          className="tg-input"
          autoComplete="new-password"
        />
        <input
          type="password"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          placeholder="Повторите пароль"
          className="tg-input"
          autoComplete="new-password"
        />
        <label className="flex items-center gap-2 text-sm text-white/70 select-none">
          <input
            type="checkbox"
            className="w-4 h-4 accent-sky-400 rounded"
            checked={rememberLogin}
            onChange={(e) => setRememberLogin(e.target.checked)}
          />
          <span>Запомнить вход</span>
        </label>
        <div className="bg-white/5 border border-white/15 rounded-2xl px-4 py-4 text-sm text-white/70 space-y-3">
          <div className="text-white/80 text-sm">Выберите аватар (необязательно)</div>
          <div className="flex flex-col gap-3">
            <input type="file" accept="image/*" onChange={handleAvatarChange} className="text-white/60" />
            {avatarPreview && (
              <div className="flex items-center gap-3">
                <img src={avatarPreview} alt="Предпросмотр аватара" className="w-16 h-16 rounded-full object-cover border border-white/20" />
                <button type="button" onClick={resetAvatar} className="text-xs underline text-white/60">
                  Удалить
                </button>
              </div>
            )}
          </div>
        </div>
        {status && <div className="text-sm text-red-400 text-center">{status}</div>}
        <button
          className="w-full tg-button tg-button--primary py-3 disabled:opacity-60"
          disabled={processing}
        >
          Завершить регистрацию
        </button>
        <div className="text-sm text-white/60 text-center">
          <button type="button" onClick={goToLogin} className="underline">
            Уже есть аккаунт? Войти
          </button>
        </div>
      </form>
    )
  }

  const renderContent = () => {
    if (mode === 'invite') return renderInvite()
    if (mode === 'register') return renderRegister()
    return renderLogin()
  }

  return (
    <div className="h-[calc(100%-48px)] flex items-center justify-center relative">
      <div className="absolute inset-0 pointer-events-none">
        <div className="w-96 h-96 rounded-full blur-3xl opacity-30 bg-sky-500/30 absolute -top-16 -left-16" />
        <div className="w-96 h-96 rounded-full blur-3xl opacity-30 bg-blue-500/30 absolute bottom-0 right-10" />
      </div>
      <div className="tg-card p-10 w-[520px] relative">
        <h1 className="text-2xl mb-6 tracking-widest text-white/90 text-center">
          {mode === 'login' && 'Добро пожаловать в NE Messenger'}
          {mode === 'invite' && 'Регистрация по приглашению'}
          {mode === 'register' && 'Создание аккаунта'}
        </h1>
        {renderContent()}
      </div>
    </div>
  )
}
