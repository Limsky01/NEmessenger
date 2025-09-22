import React from 'react'

export default function Titlebar(){
  const api = window.electronAPI || {}

  const btn = 'w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition'
  const noDrag = { WebkitAppRegion: 'no-drag' }

  return (
    <div className="drag h-12 px-4 flex items-center justify-between border-b border-white/10 panel">
      <div className="text-sm tracking-widest opacity-90 select-none">LIQUID GLASS</div>

      {/* каждая кнопка отдельно помечена no-drag */}
      <div className="flex gap-2" style={noDrag}>
        <button
          type="button"
          className={btn}
          style={noDrag}
          onClick={() => api.minimize && api.minimize()}
          title="Minimize"
        >—</button>

        <button
          type="button"
          className={btn}
          style={noDrag}
          onClick={() => api.maximize && api.maximize()}
          title="Maximize"
        >▢</button>

        <button
          type="button"
          className={`${btn} hover:bg-red-500/80`}
          style={noDrag}
          onClick={() => api.close && api.close()}
          title="Close"
        >×</button>
      </div>
    </div>
  )
}
