import React, { useEffect, useRef, useState } from 'react'
import useStore from '../state/store.js'
function initials(name){ return (name||'?').slice(0,2).toUpperCase() }
function Avatar({ seed }){ return <div className="avatar">{initials(seed)}</div> }

function FloatingUpload(){
  const inputId = 'file-input-floating'
  const onClick = ()=>{
    const el = document.getElementById(inputId); if(el){ el.value=''; el.click() }
    const host = document.querySelector('.fab-floating .fab'); if(!host) return
    const r = document.createElement('span'); r.className='fab-ripple'; host.appendChild(r); setTimeout(()=>host.removeChild(r),650)
  }
  return (
    <div className="fab-floating no-drag pointer-auto">
      <div className="fab relative cursor-pointer" onClick={onClick} title="Upload">
        <span className="fab-glow"></span>
        <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
      </div>
      <input id={inputId} type="file" className="hidden" onChange={(e)=>window.__chatUpload && window.__chatUpload(e)} />
    </div>
  )
}

export default function Chat(){
  const rid = useStore(s=>s.roomId)
  const messages = useStore(s=>s.messages[rid]||[])
  const send = useStore(s=>s.sendMessage)
  const loadMore = useStore(s=>s.loadMore)
  const [txt,setTxt]=useState('')
  const listRef = useRef(null)
  const setTyping = useStore(s=>s.setTyping)
  const users = useStore(s=>s.users)
  const me = useStore(s=>s.user)
  const genKey = useStore(s=>s.generateRoomKey)
  const setKey = useStore(s=>s.setRoomKey)

  useEffect(()=>{ listRef.current?.scrollTo({ top:listRef.current.scrollHeight }) },[messages,rid])

  const onKey = (e)=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); if(txt.trim()){ send(txt); setTxt('') } } else setTyping(true) }
  const onScroll = (e)=>{ if(e.currentTarget.scrollTop===0) loadMore() }

  const [progress, setProgress] = useState(null)
  const upload = useStore(s=>s.uploadFile)
  const doUpload = async (ev)=>{
    const f = ev.target.files?.[0]; if(!f) return
    setProgress(0)
    try{
      const id = await upload(f, (p)=>setProgress(p))
      setProgress(null)
      setTxt(prev=> prev + (prev? ' ' : '') + `[file:${id}:${f.name}]`)
    }catch(err){ console.error(err); setProgress(null); alert('Upload failed') }
  }
  useEffect(()=>{ window.__chatUpload = doUpload; return ()=>{ window.__chatUpload = null } },[])

  const nameById = (id)=> users.find(u=>u.id===id)?.username || 'user'
  const seedById = (id)=> users.find(u=>u.id===id)?.avatar_seed || '??'

  const renderContent = (c)=>{
    if (typeof c==='string' && c.startsWith('[file:')){
      const parts = c.slice(6,-1).split(':'); const id=parts[0]; const name=parts.slice(1).join(':')
      return <span className="underline cursor-pointer" onClick={()=>{ const url=useStore.getState().serverUrl+`/api/files/${id}`; const token=useStore.getState().token; window.open(url+'?token='+token,'_blank'); }}>📎 {name}</span>
    }
    return c
  }

  const peers = users.filter(u=>u.id!==me?.id)

  return (
    <div className="flex-1 flex flex-col h-full relative">
      <FloatingUpload/>
      <div className="panel px-6 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="text-sm opacity-80">{rid==='global' ? 'Global chat' : 'Direct message'}</div>
        <div className="flex items-center gap-2 text-xs">
          <button className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20" onClick={()=>{ const k=genKey(); setKey(rid,k); alert('Room key set') }}>Generate key</button>
          <div className="text-white/60">{progress!=null ? `Uploading… ${progress}%` : ''}</div>
        </div>
      </div>

      <div ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-6 space-y-3 scroll-thin">
        {messages.map(m=>{
          const mine = m.senderId===me?.id
          return (
            <div key={m.id} className={"max-w-[72%] px-4 py-3 rounded-3xl shadow-glass "+(mine?"ml-auto panel":"glass")}>
              <div className="flex items-center gap-2 text-[11px] text-white/70 mb-1">
                <Avatar seed={seedById(m.senderId)}/><span>@{nameById(m.senderId)}</span>
                <span className="opacity-60">{new Date(m.createdAt||m.created_at).toLocaleTimeString()}</span>
              </div>
              <div className="whitespace-pre-wrap leading-relaxed">{renderContent(m.content)}</div>
            </div>
          )
        })}
      </div>

      <div className="px-6 py-4 border-t border-white/10 panel">
        <div className="flex items-end gap-3">
          <textarea value={txt} onChange={e=>setTxt(e.target.value)} onKeyDown={onKey}
            placeholder="Message" className="flex-1 panel rounded-3xl px-4 py-3 outline-none resize-none h-16"
            onBlur={()=>setTyping(false)}/>
          <button onClick={()=>{ if(txt.trim()){ send(txt); setTxt('') } }} className="px-5 h-12 rounded-2xl bg-white/20 hover:bg-white/30 button-press">Send</button>
        </div>
      </div>
    </div>
  )
}
