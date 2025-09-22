import React from 'react'
import useStore from '../state/store.js'

function initials(n){ return (n||'?').slice(0,2).toUpperCase() }

export default function Sidebar(){
  const users   = useStore(s=>s.users)
  const me      = useStore(s=>s.user)
  const unread  = useStore(s=>s.unread)
  const roomId  = useStore(s=>s.roomId)
  const openGlobal = useStore(s=>s.openGlobal)
  const openDM     = useStore(s=>s.openDM)
  const dmRoom     = useStore(s=>s.dmRoom)

  const sorted = users.filter(u=>u.id!==me?.id).sort((a,b)=> a.username.localeCompare(b.username))

  return (
    <div className="w-[340px] border-r border-white/10 h-full flex flex-col bg-white/5 backdrop-blur-md">
      <div className="p-4 panel sticky top-0 space-y-3">
        <input placeholder="Search" className="w-full panel rounded-2xl px-4 py-2 outline-none"/>
        <div className="flex items-center justify-between text-xs text-white/60">
          <span>Chats</span><span>({sorted.length+1})</span>
        </div>
      </div>

      <div className="px-3 py-3 overflow-y-auto scroll-thin space-y-2">
        {/* Global */}
        <button onClick={openGlobal}
          className={`w-full flex items-center justify-between px-3 py-3 rounded-2xl ${roomId==='global'?'panel':'glass hover:bg-white/10'}`}>
          <div className="flex items-center gap-3">
            <div className="avatar">GL</div>
            <div>
              <div className="text-sm">Global chat</div>
              <div className="text-xs text-white/60">Everyone</div>
            </div>
          </div>
          {(unread['global']||0)>0 && <span className="badge">{unread['global']}</span>}
        </button>

        {/* DMs */}
        {sorted.map(u=>{
          const rid = dmRoom(me.id, u.id)
          const active = roomId === rid
          return (
            <button key={u.id} onClick={()=>openDM(u.id)}
              className={`w-full flex items-center justify-between px-3 py-3 rounded-2xl ${active?'panel':'glass hover:bg-white/10'}`}>
              <div className="flex items-center gap-3">
                <div className="avatar">{initials(u.username)}</div>
                <div>
                  <div className="text-sm">@{u.username}</div>
                  <div className="text-xs text-white/60">Direct messages</div>
                </div>
              </div>
              {(unread[rid]||0)>0 && <span className="badge">{unread[rid]}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
