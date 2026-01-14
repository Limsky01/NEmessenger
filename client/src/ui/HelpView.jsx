import React from 'react'
import useStore, { buildNameStyle } from '../state/store.js'

export default function HelpView() {
  const user = useStore((s) => s.user)
  const nameStyleValue = useStore((s) => s.nameStyle)
  const nameStyle = buildNameStyle(nameStyleValue)

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="panel px-6 py-4 border-b border-white/10">
        <div className="text-sm font-medium">Помощь</div>
        <div className="text-xs text-white/60">Быстрые подсказки по интерфейсу</div>
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin p-6 space-y-4">
        <div className="tg-card px-5 py-4">
          <div className="text-xs uppercase tracking-[0.2em] text-white/50 mb-2">Навигация</div>
          <div className="text-sm text-white/80">
            Левая панель содержит разделы: группы, друзья, упоминания, помощь, профиль и настройки.
          </div>
        </div>
        <div className="tg-card px-5 py-4">
          <div className="text-xs uppercase tracking-[0.2em] text-white/50 mb-2">Чаты</div>
          <div className="text-sm text-white/80">
            Нажмите на пользователя или канал, чтобы открыть переписку. Для отправки нажмите Enter.
          </div>
        </div>
        <div className="tg-card px-5 py-4">
          <div className="text-xs uppercase tracking-[0.2em] text-white/50 mb-2">Профиль</div>
          <div className="text-sm text-white/80">
            {user?.username ? (
              <>
                Вы вошли как <span style={nameStyle}>{user.displayName || user.username}</span>.
              </>
            ) : (
              'Обновите профиль в соответствующем разделе.'
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
