import React, { useState } from 'react'
import axios from 'axios'
import useStore from '../state/store.js'

export default function Login() {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState(null)
  const setAuth = useStore((s) => s.setAuth)
  const server = useStore((s) => s.serverUrl)

  const submit = async (event) => {
    event.preventDefault()
    setStatus(null)
    try {
      const url = mode === 'login' ? '/api/login' : '/api/register'
      const { data } = await axios.post(server + url, { username, password })
      setAuth(data.token, data.user)
    } catch (err) {
      console.error(err)
      const error = err?.response?.data?.error
      const message = (() => {
        if (error === 'username_taken') return 'Такой логин уже используется'
        if (err?.response?.status === 401) return 'Неверный логин или пароль'
        return 'Не удалось выполнить запрос'
      })()
      setStatus(message)
    }
  }

  const isLogin = mode === 'login'

  return (
    <div className="h-[calc(100%-48px)] flex items-center justify-center relative">
      <div className="absolute inset-0 pointer-events-none">
        <div className="w-96 h-96 rounded-full blur-3xl opacity-30 bg-indigo-500/40 absolute -top-16 -left-16" />
        <div className="w-96 h-96 rounded-full blur-3xl opacity-30 bg-emerald-500/40 absolute bottom-0 right-10" />
      </div>
      <div className="glass p-10 rounded-3xl w-[520px] border-white/15 relative">
        <h1 className="text-2xl mb-6 tracking-widest text-white/90 text-center">
          Добро пожаловать в NE Messenger
        </h1>
        <form onSubmit={submit} className="space-y-4">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Имя пользователя"
            className="w-full bg-white/5 border border-white/15 rounded-2xl px-4 py-3 outline-none focus:bg-white/10"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Пароль"
            className="w-full bg-white/5 border border-white/15 rounded-2xl px-4 py-3 outline-none focus:bg-white/10"
          />
          {status && <div className="text-sm text-red-400 text-center">{status}</div>}
          <button className="w-full bg-white/20 hover:bg-white/30 rounded-2xl py-3 transition">
            {isLogin ? 'Войти' : 'Создать аккаунт'}
          </button>
          <div className="text-sm text-white/70 text-center">
            {isLogin ? (
              <span>
                Нет аккаунта?
                {' '}
                <button type="button" onClick={() => setMode('register')} className="underline">
                  Зарегистрируйтесь
                </button>
              </span>
            ) : (
              <span>
                Уже есть аккаунт?
                {' '}
                <button type="button" onClick={() => setMode('login')} className="underline">
                  Войдите
                </button>
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
