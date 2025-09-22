import React, { useEffect, useRef, useState } from 'react'
import useStore from '../state/store.js'

export default function Chat(){
  const conv = useStore(s=>s.activeConversationId)
  const messages = useStore(s=>s.messages[conv] || [])
  const send = useStore(s=>s.sendMessage)
  const typingUsers = useStore(s=>s.typing[conv] || [])
  const me = useStore(s=>s.user)
  const join = useStore(s=>s.joinConversation)
  const loadMore = useStore(s=>s.loadMore)
  const [content,setContent]=useState('')
  const listRef = useRef(null)
  const [atTop,setAtTop]=useState(false)
  useEffect(()=>{ if(conv) join(conv) },[conv])
  useEffect(()=>{
    if(!atTop){
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
    }
  },[messages,conv])
  const onScroll = (e)=>{
    const el = e.currentTarget
    if(el.scrollTop === 0){
      setAtTop(true)
      loadMore(conv)
    }else{
      setAtTop(false)
    }
  }
  const onKey = (e)=>{
    if(e.key==='Enter' && !e.shiftKey){
      e.preventDefault()
      if(content.trim().length){
        send(conv, content.trim())
        setContent('')
      }
    }
  }
  const setTyping = useStore(s=>s.setTyping)
  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="panel px-6 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="text-sm opacity-80">Conversation</div>
        <div className="text-xs text-white/60">{typingUsers.length>0 ? (typingUsers.length===1?'Typing...':'Several typing...') : ''}</div>
      </div>
      <div ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-6 space-y-3 scroll-thin">
        {messages.map(m=>{
          const mine = m.senderId===me?.id
          return (
            <div key={m.id} className={"max-w-[70%] px-4 py-3 rounded-3xl shadow-glass "+(mine?"ml-auto panel":"glass")}>
              <div className="text-[10px] text-white/60 mb-1">{new Date(m.createdAt||m.created_at).toLocaleTimeString()}</div>
              <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
            </div>
          )
        })}
      </div>
      <div className="px-6 py-4 border-t border-white/10 panel">
        <div className="flex items-end gap-3">
          <textarea value={content} onChange={e=>{setContent(e.target.value); setTyping(conv, true)}} onBlur={()=>setTyping(conv,false)} onKeyDown={onKey}
            placeholder="Type a message..." className="flex-1 panel rounded-3xl px-4 py-3 outline-none resize-none h-16"/>
          <button onClick={()=>{ if(content.trim()){ send(conv, content.trim()); setContent('') } }} className="px-5 h-12 rounded-2xl bg-white/20 hover:bg-white/30">Send</button>
        </div>
      </div>
    </div>
  )
}
