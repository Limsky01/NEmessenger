import React from 'react'
export default function Titlebar(){
  const api = window.electronAPI||{}
  const btn='w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition button-press pointer-auto no-drag'
  const noDrag={WebkitAppRegion:'no-drag'}
  return (
    <div className="drag h-12 px-4 flex items-center justify-between border-b border-white/10 panel">
      <div className="text-sm tracking-widest opacity-90 select-none">LIQUID GLASS · v6.2</div>
      <div className="flex gap-2 pointer-auto no-drag" style={noDrag}>
        <button className={btn} onClick={()=> (api.minimize? api.minimize(): window.blur())} title="Minimize">—</button>
        <button className={btn} onClick={()=> (api.maximize? api.maximize(): document.body.requestFullscreen&&document.body.requestFullscreen())} title="Maximize">▢</button>
        <button className={btn+' hover:bg-red-500/80'} onClick={()=> (api.close? api.close(): window.close())} title="Close">×</button>
      </div>
    </div>
  )
}
