import React, { useEffect, useMemo, useState } from 'react'

const api = typeof window !== 'undefined' ? window.electronAPI : undefined

const baseBtn = 'w-8 h-8 rounded-xl flex items-center justify-center transition button-press pointer-auto no-drag'
const hoverMap = {
  default: ' bg-white/10 hover:bg-white/20',
  danger: ' bg-white/10 hover:bg-red-500/80',
}

function TitleButton({ onClick, title, children, variant = 'default', disabled }) {
  return (
    <button
      type="button"
      className={`${baseBtn}${hoverMap[variant]}`}
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

function MinimizeIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
      <line x1="2" x2="10" y1="6" y2="6" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <line x1="2" y1="2" x2="10" y2="10" />
      <line x1="10" y1="2" x2="2" y2="10" />
    </svg>
  )
}

function MaximizeIcon({ isMaximized }) {
  if (isMaximized) {
    return (
      <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M3 4.5h4.5V9" />
        <path d="M6.5 3H3v4.5" />
      </svg>
    )
  }
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2.5" y="2.5" width="7" height="7" />
    </svg>
  )
}

export default function Titlebar() {
  const [windowState, setWindowState] = useState({ maximized: false, fullscreen: false })
  const noclickStyle = useMemo(() => ({ WebkitAppRegion: 'no-drag' }), [])

  useEffect(() => {
    if (!api) return undefined
    let unsubscribe
    api.getWindowState?.().then((state) => state && setWindowState(state))
    if (api.onWindowState) {
      unsubscribe = api.onWindowState((state) => setWindowState(state))
    }
    return () => unsubscribe?.()
  }, [])

  const handleMinimize = () => {
    if (api?.minimize) api.minimize()
    else window.blur()
  }

  const handleToggleFullscreen = () => {
    if (api?.toggleMaximize) {
      api.toggleMaximize()
      return
    }
    if (document.fullscreenElement) {
      document.exitFullscreen?.()
    } else {
      document.documentElement.requestFullscreen?.()
    }
  }

  const handleClose = () => {
    if (api?.close) api.close()
    else window.close()
  }

  const isExpanded = windowState.maximized || windowState.fullscreen

  const handleMouseDown = (event) => {
    if (event.button !== 0) return
    if (event.target.closest?.('.no-drag')) return
    if (!api?.beginDrag) return
    const screenX = window.screenX + event.clientX
    const screenY = window.screenY + event.clientY
    api.beginDrag({ screenX, screenY })
  }

  return (
    <div
      className="drag h-12 px-4 flex items-center justify-between border-b border-white/10 panel"
      onMouseDown={handleMouseDown}
      onDoubleClick={(event) => {
        event.preventDefault()
        handleToggleFullscreen()
      }}
    >
      <div className="text-sm tracking-widest opacity-90 select-none">NE Messenger</div>
      <div className="flex gap-2 pointer-auto" style={noclickStyle}>
        <TitleButton onClick={handleMinimize} title="Свернуть">
          <MinimizeIcon />
        </TitleButton>
        <TitleButton onClick={handleToggleFullscreen} title={isExpanded ? 'Вернуть окно' : 'Развернуть'}>
          <MaximizeIcon isMaximized={isExpanded} />
        </TitleButton>
        <TitleButton onClick={handleClose} title="Закрыть" variant="danger">
          <CloseIcon />
        </TitleButton>
      </div>
    </div>
  )
}
