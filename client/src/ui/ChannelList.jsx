import React from 'react'
import useStore from '../state/store.js'

export default function ChannelList(){
  const channels = useStore(s=>s.channels)
  const active = useStore(s=>s.activeChannelId)
  const unread = useStore(s=>s.unread)
  const switchCh = useStore(s=>s.switchChannel)

  return (
    <div className="w-[280px] border-r border-white/10 bg-white/5 backdrop-blur-md h-full flex flex-col">
      <div className="p-4 panel sticky top-0">
        <div className="text-[13px] tracking-widest opacity-80">ГЛАВНАЯ</div>
        <div className="text-xs text-white/60">Каналы</div>
      </div>
      <div className="px-3 py-3 overflow-y-auto scroll-thin space-y-2">
        {channels.map(ch=>{
          const isActive = ch.id===active
          return (
            <button key={ch.id} onClick={()=>switchCh(ch.id)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl ${isActive?'panel':'glass hover:bg-white/10'} transition`}>
              <span>＃ {ch.name}</span>
              { (unread[ch.id]||0)>0 && <span className="badge">{unread[ch.id]}</span> }
            </button>
          )
        })}
      </div>
      {/* E2EE controls */}
      {active && (
        <div className="p-3 border-t border-white/10 panel">
          <E2EEControls channelId={active}/>
        </div>
      )}
    </div>
  )
}

function E2EEControls({ channelId }){
  const setKey = useStore(s=>s.setChannelKey)
  const getKey = useStore(s=>s.getChannelKey)
  const gen = ()=>{
    const key = window.crypto.getRandomValues(new Uint8Array(32))
    // use base64 from btoa
    let b64 = ''
    const chunkSize = 0x8000
    for (let i=0; i<key.length; i+=chunkSize){
      b64 += String.fromCharCode.apply(null, key.subarray(i, i+chunkSize))
    }
    b64 = btoa(b64)
    return b64
  }
  const save = ()=>{
    const input = prompt('Введите общий ключ канала (Base64). Оставьте поле пустым, чтобы создать новый.', '')
    const value = input && input.trim().length ? input.trim() : gen()
    setKey(channelId, value)
    alert('Ключ установлен для этого канала. Передайте его собеседникам безопасным способом.')
  }
  const show = ()=>{
    const val = getKey(channelId) || 'отсутствует'
    alert('Ключ канала: '+val)
  }
  return (
    <div className="flex items-center gap-2 text-xs">
      <button onClick={save} className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20">Установить ключ</button>
      <button onClick={show} className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20">Показать ключ</button>
      <span className="text-white/60">Конечное шифрование выполняется на клиенте. Сервер хранит только зашифрованные данные.</span>
    </div>
  )
}

