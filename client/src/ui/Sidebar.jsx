import React from 'react'
import useStore from '../state/store.js'

export default function Sidebar(){
  const users = useStore(s=>s.users)
  const me = useStore(s=>s.user)
  const openDm = useStore(s=>s.openDm)
  const online = useStore(s=>s.onlineUserIds)
  const setActiveConv = useStore(s=>s.setActiveConversation)
  const globalId = useStore(s=>s.globalConversationId)

  return (
    <div className="w-[320px] border-r border-white/10 bg-white/5 backdrop-blur-md h-full flex flex-col">
      <div className="p-4 sticky top-0 panel">
        <div className="text-[13px] tracking-widest opacity-80 mb-1">DISCOVER</div>
        <div className="text-xs text-white/60">Signed in as @{me?.username}</div>
      </div>
      <div className="px-4 py-3">
        <button onClick={()=>setActiveConv(globalId)} className="w-full text-left panel hover:bg-white/10 rounded-2xl px-4 py-3">🌐 Global chat</button>
      </div>
      <div className="px-4 pb-4 overflow-y-auto scroll-thin">
        <div className="uppercase text-[11px] text-white/50 mb-2">People</div>
        <div className="space-y-2">
          {users.filter(u=>u.id!==me?.id).map(u=>{
            const isOnline = online.includes(u.id)
            return (
              <button key={u.id} onClick={()=>openDm(u.id)} className="w-full panel hover:bg-white/10 rounded-2xl px-3 py-2 flex items-center justify-between">
                <span>@{u.username}</span>
                <span className={"text-xs "+(isOnline?'text-emerald-300':'text-white/40')}>{isOnline?'online':'offline'}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
