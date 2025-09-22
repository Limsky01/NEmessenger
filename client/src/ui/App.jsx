import React, { useEffect } from 'react'
import Login from './Login.jsx'
import Sidebar from './Sidebar.jsx'
import Chat from './Chat.jsx'
import Titlebar from './Titlebar.jsx'
import useStore from '../state/store.js'

export default function App(){
  const token = useStore(s=>s.token)
  const init = useStore(s=>s.initSocket)

  useEffect(()=>{ if(token) init() },[token])

  return (
    // Полноэкранный фон без внешних паддингов/скруглений
    <div className="h-full w-full app-bg font-mc">
      <div className="h-full w-full overflow-hidden">
        <Titlebar/>
        { token ? (
          <div className="flex h-[calc(100%-48px)]">
            <Sidebar />
            <Chat />
          </div>
        ) : <Login /> }
      </div>
    </div>
  )
}
