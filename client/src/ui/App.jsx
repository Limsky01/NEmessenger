import React, { useEffect, useState } from 'react'
import Titlebar from './Titlebar.jsx'
import Sidebar from './Sidebar.jsx'
import Chat from './Chat.jsx'
import Login from './Login.jsx'
import Profile from './Profile.jsx'
import AdminPanel from './AdminPanel.jsx'
import useStore from '../state/store.js'
import { motion, AnimatePresence } from 'framer-motion'

export default function App() {
  const token = useStore((s) => s.token)
  const connect = useStore((s) => s.connect)
  const view = useStore((s) => s.view)
  const [showSplash, setShowSplash] = useState(true)

  useEffect(() => {
    if (token) connect()
  }, [token, connect])

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 600)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="h-full w-full app-bg font-mc">
      <AnimatePresence>
        {showSplash && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="glass rounded-3xl px-8 py-6 text-xl tracking-wider">Загрузка…</div>
          </motion.div>
        )}
      </AnimatePresence>

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
    </div>
  )
}


