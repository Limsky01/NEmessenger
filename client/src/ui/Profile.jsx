import React, { useCallback, useEffect, useRef, useState } from 'react'
import Cropper from 'react-easy-crop'
import useStore, { buildNameStyle } from '../state/store.js'
import AvatarImage from './AvatarImage.jsx'

export default function Profile({
  embedded = false,
  includeInvites = true,
  includePassword = true,
  includeProfileEditor = true,
}) {
  const user = useStore((s) => s.user)
  const openChat = useStore((s) => s.openChat)
  const updateAvatar = useStore((s) => s.updateAvatar)
  const changePassword = useStore((s) => s.changePassword)
  const buildAvatarUrl = useStore((s) => s.buildAvatarUrl)
  const profileBackground = useStore((s) => s.profileBackground)
  const updateProfileBackground = useStore((s) => s.updateProfileBackground)
  const profileStatus = useStore((s) => s.profileStatus)
  const setProfileStatus = useStore((s) => s.setProfileStatus)
  const updateProfileStatus = useStore((s) => s.updateProfileStatus)
  const nameStyleValue = useStore((s) => s.nameStyle)
  const setNameStyle = useStore((s) => s.setNameStyle)
  const updateNameStyle = useStore((s) => s.updateNameStyle)
  const updateDisplayName = useStore((s) => s.updateDisplayName)
  const invites = useStore((s) => s.invites) ?? []
  const fetchInvites = useStore((s) => s.fetchInvites)
  const createInvite = useStore((s) => s.createInvite)
  const revokeInvite = useStore((s) => s.revokeInvite)

  const roleLabel = user?.role === 'admin' ? 'Администратор' : 'Пользователь'
  const fileInputRef = useRef(null)
  const profileBgInputRef = useRef(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [avatarStatus, setAvatarStatus] = useState(null)
  const [profileBgPreview, setProfileBgPreview] = useState(null)
  const [profileBgStatus, setProfileBgStatus] = useState(null)
  const [profileStatusStatus, setProfileStatusStatus] = useState(null)
  const [cropOpen, setCropOpen] = useState(false)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1.1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [profileBgCropOpen, setProfileBgCropOpen] = useState(false)
  const [profileBgCrop, setProfileBgCrop] = useState({ x: 0, y: 0 })
  const [profileBgZoom, setProfileBgZoom] = useState(1)
  const [profileBgCroppedArea, setProfileBgCroppedArea] = useState(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordStatus, setPasswordStatus] = useState(null)
  const [displayName, setDisplayName] = useState(() => user?.displayName || user?.username || '')
  const [displayNameStatus, setDisplayNameStatus] = useState(null)
  const displayNameRef = useRef(displayName)
  const [nameStyleOpen, setNameStyleOpen] = useState(false)
  const [draftNameFont, setDraftNameFont] = useState('rubik')
  const [draftNameEffect, setDraftNameEffect] = useState('minimal')
  const [draftNameColor, setDraftNameColor] = useState('#8ec5ff')
  const [inviteTtl, setInviteTtl] = useState('604800000')
  const [inviteActionStatus, setInviteActionStatus] = useState(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [revokeInviteId, setRevokeInviteId] = useState(null)
  const [copiedInviteId, setCopiedInviteId] = useState(null)
  const inviteStatusTimerRef = useRef(null)
  const inviteCopyTimerRef = useRef(null)

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
  }, [avatarPreview])

  useEffect(() => {
    if (!user) return
    setDisplayName(user.displayName || user.username || '')
    displayNameRef.current = user.displayName || user.username || ''
  }, [user?.displayName, user?.username])

  useEffect(() => () => {
    if (profileBgPreview && profileBgPreview.startsWith('blob:')) {
      URL.revokeObjectURL(profileBgPreview)
    }
  }, [profileBgPreview])

  useEffect(() => {
    if (!user) return
    fetchInvites().catch((err) => console.error(err))
  }, [user, fetchInvites])

  useEffect(
    () => () => {
      if (inviteStatusTimerRef.current) clearTimeout(inviteStatusTimerRef.current)
      if (inviteCopyTimerRef.current) clearTimeout(inviteCopyTimerRef.current)
    },
    [],
  )

  const handleAvatarSelect = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type?.startsWith('image/')) {
      setAvatarStatus({ type: 'error', message: 'Можно выбрать только изображение' })
      if (event.target) event.target.value = ''
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarStatus({ type: 'error', message: 'Размер изображения не должен превышать 5 МБ' })
      if (event.target) event.target.value = ''
      return
    }
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    const previewUrl = URL.createObjectURL(file)
    setAvatarPreview(previewUrl)
    setAvatarStatus(null)
    if (file.type === 'image/gif') {
      updateAvatar(file)
        .then(() => {
          if (fileInputRef.current) fileInputRef.current.value = ''
          setAvatarStatus({ type: 'success', message: 'Аватар обновлён' })
        })
        .catch((err) => {
          console.error(err)
          setAvatarStatus({ type: 'error', message: 'Не удалось обновить аватар' })
        })
      return
    }
    setCrop({ x: 0, y: 0 })
    setZoom(1.1)
    setCroppedAreaPixels(null)
    setCropOpen(true)
  }

  const onCropComplete = useCallback((_, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels)
  }, [])

  const onProfileBgCropComplete = useCallback((_, croppedPixels) => {
    setProfileBgCroppedArea(croppedPixels)
  }, [])

  const createImage = (url) =>
    new Promise((resolve, reject) => {
      const image = new Image()
      image.addEventListener('load', () => resolve(image))
      image.addEventListener('error', (err) => reject(err))
      image.setAttribute('crossOrigin', 'anonymous')
      image.src = url
    })

  const getCroppedBlob = async (imageSrc, cropPixels) => {
    const image = await createImage(imageSrc)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no_canvas')
    const size = Math.min(cropPixels.width, cropPixels.height)
    canvas.width = size
    canvas.height = size
    ctx.drawImage(
      image,
      cropPixels.x,
      cropPixels.y,
      size,
      size,
      0,
      0,
      size,
      size,
    )
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92)
    })
  }

  const applyAvatarCrop = async () => {
    if (!avatarPreview || !croppedAreaPixels) return
    try {
      const blob = await getCroppedBlob(avatarPreview, croppedAreaPixels)
      if (!blob) return
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
      setAvatarPreview(URL.createObjectURL(blob))
      setCropOpen(false)
      setAvatarStatus(null)
      await updateAvatar(file)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setAvatarStatus({ type: 'success', message: 'Аватар обновлён' })
    } catch (err) {
      console.error(err)
      const code = err?.response?.data?.error
      const message =
        code === 'avatar_too_large'
          ? 'Размер изображения не должен превышать 5 МБ'
          : 'Не удалось обновить аватар'
      setAvatarStatus({ type: 'error', message })
    }
  }

  const applyProfileBackgroundCrop = async () => {
    if (!profileBgPreview || !profileBgCroppedArea) return
    try {
      const blob = await getCroppedRectBlob(profileBgPreview, profileBgCroppedArea)
      if (!blob) return
      const dataUrl = await blobToDataUrl(blob)
      if (!dataUrl) throw new Error('no_data_url')
      await updateProfileBackground(dataUrl)
      setProfileBgStatus({ type: 'success', message: 'Фон профиля обновлён' })
      setProfileBgCropOpen(false)
      setProfileBgCroppedArea(null)
      if (profileBgPreview.startsWith('blob:')) URL.revokeObjectURL(profileBgPreview)
      setProfileBgPreview(null)
      if (profileBgInputRef.current) profileBgInputRef.current.value = ''
    } catch (err) {
      console.error(err)
      setProfileBgStatus({ type: 'error', message: 'Не удалось обновить фон' })
    }
  }

  const closeProfileBgCrop = () => {
    setProfileBgCropOpen(false)
    if (profileBgPreview && profileBgPreview.startsWith('blob:')) {
      URL.revokeObjectURL(profileBgPreview)
    }
    setProfileBgPreview(null)
  }

  const getCroppedRectBlob = async (imageSrc, cropPixels) => {
    const image = await createImage(imageSrc)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no_canvas')
    const width = Math.max(1, Math.round(cropPixels.width))
    const height = Math.max(1, Math.round(cropPixels.height))
    canvas.width = width
    canvas.height = height
    ctx.drawImage(
      image,
      cropPixels.x,
      cropPixels.y,
      width,
      height,
      0,
      0,
      width,
      height,
    )
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92)
    })
  }

  const blobToDataUrl = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
      reader.onerror = (err) => reject(err)
      reader.readAsDataURL(blob)
    })

  const handleProfileBackgroundSelect = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type?.startsWith('image/')) {
      setProfileBgStatus({ type: 'error', message: 'Можно выбрать только изображение' })
      if (event.target) event.target.value = ''
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setProfileBgStatus({ type: 'error', message: 'Размер изображения не должен превышать 5 МБ' })
      if (event.target) event.target.value = ''
      return
    }
    if (file.type === 'image/gif') {
      const reader = new FileReader()
      reader.onload = async () => {
        const result = typeof reader.result === 'string' ? reader.result : ''
        if (result) {
          try {
            await updateProfileBackground(result)
            setProfileBgStatus({ type: 'success', message: 'Фон профиля обновлён' })
          } catch (err) {
            console.error(err)
            setProfileBgStatus({ type: 'error', message: 'Не удалось обновить фон' })
          }
        } else {
          setProfileBgStatus({ type: 'error', message: 'Не удалось загрузить фон' })
        }
      }
      reader.onerror = () => {
        setProfileBgStatus({ type: 'error', message: 'Не удалось загрузить фон' })
      }
      reader.readAsDataURL(file)
      if (event.target) event.target.value = ''
      return
    }
    if (profileBgPreview && profileBgPreview.startsWith('blob:')) {
      URL.revokeObjectURL(profileBgPreview)
    }
    setProfileBgPreview(URL.createObjectURL(file))
    setProfileBgStatus(null)
    setProfileBgCrop({ x: 0, y: 0 })
    setProfileBgZoom(1)
    setProfileBgCroppedArea(null)
    setProfileBgCropOpen(true)
    if (event.target) event.target.value = ''
  }

  const nameFontOptions = [
    { id: 'rubik', label: 'Rubik', family: '"Rubik", sans-serif' },
    { id: 'inter', label: 'Inter', family: '"Inter", sans-serif' },
    { id: 'mono', label: 'Mono', family: '"JetBrains Mono", monospace' },
    { id: 'serif', label: 'Serif', family: '"Times New Roman", serif' },
    { id: 'display', label: 'Display', family: '"Trebuchet MS", sans-serif' },
    { id: 'georgia', label: 'Georgia', family: 'Georgia, serif' },
  ]

  const nameEffectOptions = [
    { id: 'minimal', label: 'Минимализм' },
    { id: 'gradient', label: 'Градиент' },
    { id: 'neon', label: 'Неон' },
    { id: 'glow', label: 'Сияние' },
    { id: 'outline', label: 'Контур' },
  ]

  const nameColorOptions = [
    '#8ec5ff',
    '#8bf2c5',
    '#ffd479',
    '#ff8db1',
    '#caa7ff',
    '#7ee7ff',
    '#ff9b9b',
    '#a9ffea',
  ]

  const openNameStyleModal = () => {
    setDraftNameFont(nameStyleValue?.font || 'rubik')
    setDraftNameEffect(nameStyleValue?.effect || 'minimal')
    setDraftNameColor(nameStyleValue?.color || '#8ec5ff')
    setNameStyleOpen(true)
  }

  const applyNameStyle = async () => {
    try {
      await updateNameStyle({ font: draftNameFont, effect: draftNameEffect, color: draftNameColor })
    } catch (err) {
      console.error(err)
      setNameStyle({ font: draftNameFont, effect: draftNameEffect, color: draftNameColor })
    } finally {
      setNameStyleOpen(false)
    }
  }

  const resetNameStyle = async () => {
    try {
      await updateNameStyle({ font: 'rubik', effect: 'minimal', color: '#8ec5ff' })
    } catch (err) {
      console.error(err)
      setNameStyle({ font: 'rubik', effect: 'minimal', color: '#8ec5ff' })
    }
  }

  const saveDisplayName = async () => {
    const next = displayName.trim()
    if (!next) {
      setDisplayNameStatus({ type: 'error', message: 'Имя не может быть пустым' })
      return
    }
    if (next === displayNameRef.current) return
    try {
      await updateDisplayName(next)
      displayNameRef.current = next
      setDisplayNameStatus({ type: 'success', message: 'Имя обновлено' })
    } catch (err) {
      console.error(err)
      setDisplayNameStatus({ type: 'error', message: 'Не удалось обновить имя' })
    }
  }

  const inviteStatusLabels = {
    active: 'Активен',
    claimed: 'Ожидает регистрации',
    used: 'Использован',
    expired: 'Просрочен',
    revoked: 'Отозван',
  }

  const formatInviteDate = (value) => {
    if (!value) return ''
    try {
      return new Date(value).toLocaleString('ru-RU')
    } catch (err) {
      console.error('invite date format failed', err)
      return ''
    }
  }

  const showInviteStatus = (payload) => {
    if (inviteStatusTimerRef.current) clearTimeout(inviteStatusTimerRef.current)
    setInviteActionStatus(payload)
    if (payload) {
      inviteStatusTimerRef.current = setTimeout(() => setInviteActionStatus(null), 4000)
    }
  }

  const handleCreateInvite = async () => {
    showInviteStatus(null)
    setInviteLoading(true)
    try {
      const ttlMs = parseInt(inviteTtl, 10)
      const invite = await createInvite(Number.isFinite(ttlMs) ? ttlMs : undefined)
      if (invite) {
        let message = `Создан новый код: ${invite.code}`
        try {
          if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(invite.code)
            setCopiedInviteId(invite.id)
            if (inviteCopyTimerRef.current) clearTimeout(inviteCopyTimerRef.current)
            inviteCopyTimerRef.current = setTimeout(() => setCopiedInviteId(null), 2000)
            message = `Код ${invite.code} скопирован в буфер обмена`
          }
        } catch (copyErr) {
          console.error(copyErr)
        }
        showInviteStatus({ type: 'success', message })
      }
    } catch (err) {
      console.error(err)
      showInviteStatus({ type: 'error', message: 'Не удалось создать код приглашения' })
    } finally {
      setInviteLoading(false)
    }
  }

  const handleCopyInvite = async (invite) => {
    if (!invite?.code) return
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(invite.code)
        setCopiedInviteId(invite.id)
        if (inviteCopyTimerRef.current) clearTimeout(inviteCopyTimerRef.current)
        inviteCopyTimerRef.current = setTimeout(() => setCopiedInviteId(null), 2000)
        showInviteStatus({ type: 'success', message: `Код ${invite.code} скопирован` })
      } else {
        showInviteStatus({ type: 'info', message: `Код: ${invite.code}` })
      }
    } catch (err) {
      console.error(err)
      showInviteStatus({ type: 'error', message: 'Не удалось скопировать код' })
    }
  }

  const handleRevokeInvite = async (invite) => {
    if (!invite) return
    setRevokeInviteId(invite.id)
    showInviteStatus(null)
    try {
      await revokeInvite(invite.id)
      showInviteStatus({ type: 'success', message: `Код ${invite.code} отозван` })
    } catch (err) {
      console.error(err)
      showInviteStatus({ type: 'error', message: 'Не удалось отозвать код' })
    } finally {
      setRevokeInviteId(null)
    }
  }

  const handlePasswordSubmit = async (event) => {
    event.preventDefault()
    setPasswordStatus(null)
    if (!newPassword || newPassword.length < 6) {
      setPasswordStatus({ type: 'error', message: 'Пароль должен содержать не менее 6 символов' })
      return
    }
    try {
      await changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setPasswordStatus({ type: 'success', message: 'Пароль успешно изменён' })
    } catch (err) {
      console.error(err)
      const code = err?.response?.data?.error
      const message =
        code === 'invalid_current_password'
          ? 'Неверный текущий пароль'
          : 'Не удалось изменить пароль'
      setPasswordStatus({ type: 'error', message })
    }
  }

  if (!user) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/60">
        Профиль недоступен
      </div>
    )
  }

  const persistentAvatarSrc = buildAvatarUrl?.(user) || null
  const previewSrc = avatarPreview || persistentAvatarSrc
  const profileBannerStyle = profileBackground
    ? { backgroundImage: `url(${profileBackground})` }
    : undefined
  const nameStyle = buildNameStyle(nameStyleValue)
  const draftNameStyle = buildNameStyle({
    font: draftNameFont,
    effect: draftNameEffect,
    color: draftNameColor,
  })

  const mainPanelClass = embedded
    ? 'flex-1 overflow-y-auto scroll-thin space-y-8'
    : 'flex-1 overflow-y-auto scroll-thin p-8 space-y-8'

  return (
    <div className={embedded ? 'text-sm' : 'flex-1 h-full overflow-hidden text-sm'}>
      <div className="flex">
        {!embedded && (
          <aside className="w-80 border-r border-white/10 bg-[#101822] p-6 space-y-6">
          <div className="flex flex-col items-center gap-4">
            <AvatarImage user={user} size={96} src={previewSrc} />
            <div className="text-center">
              <div className="text-lg font-semibold" style={nameStyle}>
                {displayName || user.displayName || user.username}
              </div>
              <div className="text-xs text-white/60">{roleLabel}</div>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="tg-button text-xs"
            >
              Изменить
            </button>
            <button
              type="button"
              onClick={openChat}
              className="w-full tg-button"
            >
              Вернуться в чат
            </button>
          </div>

          <div className="space-y-2">
            <div className="text-xs uppercase tracking-[0.25em] text-white/50">Аккаунт</div>
            <div className="text-sm text-white/80">
              ID аккаунта: <span style={nameStyle}>{user.username}</span>
            </div>
            <div className="text-sm text-white/80">ID: {user.id}</div>
            <div className="text-sm text-white/80">Роль: {roleLabel}</div>
          </div>
          </aside>
        )}

        <div className={mainPanelClass}>
          {includeProfileEditor && (
            <section className="panel rounded-3xl px-6 py-6 space-y-6">
              <div className="text-white/70 text-xs uppercase tracking-[0.25em]">Редактирование профиля</div>
              <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-sm text-white/80">Отображаемое имя</label>
                    <input
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      onBlur={saveDisplayName}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          saveDisplayName()
                        }
                      }}
                      placeholder="Например, T-T"
                      className="tg-input text-sm"
                    />
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={saveDisplayName} className="tg-button text-sm">
                        Сохранить имя
                      </button>
                      {displayNameStatus && (
                        <div className={displayNameStatus.type === 'success' ? 'text-sky-300 text-xs' : 'text-red-400 text-xs'}>
                          {displayNameStatus.message}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm text-white/80">Стили отображаемого имени</div>
                    <div className="flex flex-row flex-nowrap gap-2">
                      <button type="button" onClick={openNameStyleModal} className="tg-button text-sm">Изменить стиль</button>
                      <button type="button" onClick={resetNameStyle} className="tg-button text-sm">Удалить стиль</button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-white/80">Статус</label>
                    <input
                      value={profileStatus}
                      onChange={(event) => setProfileStatus(event.target.value)}
                      onBlur={() => {
                        updateProfileStatus(profileStatus)
                          .then(() => setProfileStatusStatus({ type: 'success', message: 'Статус обновлён' }))
                          .catch(() => setProfileStatusStatus({ type: 'error', message: 'Не удалось обновить статус' }))
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          updateProfileStatus(profileStatus)
                            .then(() => setProfileStatusStatus({ type: 'success', message: 'Статус обновлён' }))
                            .catch(() => setProfileStatusStatus({ type: 'error', message: 'Не удалось обновить статус' }))
                        }
                      }}
                      placeholder="В сети"
                      className="tg-input text-sm"
                    />
                    {profileStatusStatus && (
                      <div className={profileStatusStatus.type === 'success' ? 'text-sky-300 text-xs' : 'text-red-400 text-xs'}>
                        {profileStatusStatus.message}
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="text-sm text-white/80">Виджеты в профиле</div>
                    <p className="text-xs text-white/50">
                      Персонализируйте полный профиль, добавив виджеты на доску.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="text-sm text-white/80">Аватар</div>
                    <div className="flex flex-row flex-nowrap gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="tg-button text-sm"
                      >
                        Смена аватара
                      </button>
                      <button type="button" className="tg-button text-sm">Удалить аватар</button>
                    </div>
                    {avatarStatus && (
                      <div className={avatarStatus.type === 'success' ? 'text-sky-300 text-xs' : 'text-red-400 text-xs'}>
                        {avatarStatus.message}
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="text-sm text-white/80">Фон профиля</div>
                    <div className="flex flex-row flex-nowrap gap-2">
                      <button
                        type="button"
                        onClick={() => profileBgInputRef.current?.click()}
                        className="tg-button text-sm"
                      >
                        Сменить фон
                      </button>
                      {profileBackground && (
                        <button
                          type="button"
                          onClick={() => {
                            updateProfileBackground('')
                              .then(() => setProfileBgStatus({ type: 'success', message: 'Фон профиля удалён' }))
                              .catch(() => setProfileBgStatus({ type: 'error', message: 'Не удалось удалить фон' }))
                          }}
                          className="tg-button text-sm"
                        >
                          Удалить фон
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-white/50">JPG, PNG или WEBP, до 5 МБ.</div>
                    {profileBgStatus && (
                      <div className={profileBgStatus.type === 'success' ? 'text-sky-300 text-xs' : 'text-red-400 text-xs'}>
                        {profileBgStatus.message}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="text-sm text-white/70">Предпросмотр</div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div
                      className={`h-24 w-full rounded-xl ${profileBackground ? 'bg-center bg-cover' : 'bg-gradient-to-r from-slate-800 to-slate-900'}`}
                      style={profileBannerStyle}
                    />
                    <div className="-mt-10 flex items-center gap-3">
                      <AvatarImage user={user} size={64} src={previewSrc} className="border border-white/10" />
                      <div>
                        <div className="text-base font-semibold" style={nameStyle}>{displayName || user.displayName || user.username}</div>
                        <div className="text-xs text-white/60">
                          {(displayName || user.displayName || user.username)} · {profileStatus || 'В сети'}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 rounded-xl bg-white/5 p-3 text-xs text-white/60">
                      Пользователь находится в сети.
                    </div>
                    <button type="button" className="mt-4 w-full tg-button text-sm">
                      Пример кнопки
                    </button>
                  </div>
                  <div className="text-sm text-white/70">Предпросмотр бейджика</div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3 flex items-center gap-2">
                    <AvatarImage user={user} size={36} src={previewSrc} />
                    <div className="text-sm font-medium" style={nameStyle}>{displayName || user.displayName || user.username}</div>
                    <span className="text-[10px] bg-white/10 px-2 py-1 rounded-full">NEW</span>
                  </div>
                </div>
              </div>
            </section>
          )}
          {includeInvites ? (
            <section className="panel rounded-3xl px-6 py-5 space-y-4">
        <div className="text-white/70 text-xs uppercase tracking-[0.25em]">Приглашения</div>
        <div className="space-y-4 text-sm">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <label className="text-xs uppercase tracking-[0.2em] text-white/50 block mb-2">Срок действия</label>
              <select
                value={inviteTtl}
                onChange={(e) => setInviteTtl(e.target.value)}
                className="tg-input"
              >
                <option value="86400000">24 часа</option>
                <option value="604800000">7 дней</option>
                <option value="1209600000">14 дней</option>
              </select>
            </div>
            <button
              type="button"
              onClick={handleCreateInvite}
              disabled={inviteLoading}
              className="tg-button disabled:opacity-60"
            >
              Создать код
            </button>
          </div>
          {inviteActionStatus && (
            <div
              className={`text-center ${
                inviteActionStatus.type === 'success'
                  ? 'text-sky-300'
                  : inviteActionStatus.type === 'error'
                  ? 'text-red-400'
                  : 'text-white/70'
              }`}
            >
              {inviteActionStatus.message}
            </div>
          )}
          <div className="space-y-3">
            {invites.filter((invite) => invite.status !== 'revoked').length === 0 ? (
              <div className="text-white/50 text-sm">
                Кодов пока нет. Создайте первый, чтобы пригласить друзей.
              </div>
            ) : (
              invites.filter((invite) => invite.status !== 'revoked').map((invite) => {
                const statusLabel = inviteStatusLabels[invite.status] ?? invite.status
                const expiresAt = formatInviteDate(invite.expiresAt)
                const claimedAt = invite.status === 'claimed' ? formatInviteDate(invite.claimedAt) : ''
                const usedAt = invite.status === 'used' ? formatInviteDate(invite.usedAt) : ''
                const canRevoke = invite.status === 'active' || invite.status === 'claimed'
                return (
                  <div
                    key={invite.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-4"
                  >
                    <div className="space-y-1 text-sm">
                      <div className="text-lg tracking-[0.3em] text-white/90">{invite.code}</div>
                      <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                        Статус:
                        {' '}
                        <span className="text-white/70 normal-case">{statusLabel}</span>
                      </div>
                      {expiresAt && <div className="text-white/50 text-xs">Действует до: {expiresAt}</div>}
                      {claimedAt && <div className="text-white/50 text-xs">Код зарезервирован: {claimedAt}</div>}
                      {usedAt && <div className="text-white/50 text-xs">Использован: {usedAt}</div>}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                      <button
                        type="button"
                        onClick={() => handleCopyInvite(invite)}
                        className="tg-button text-sm disabled:opacity-60"
                      >
                        {copiedInviteId === invite.id ? 'Скопировано' : 'Скопировать'}
                      </button>
                      {canRevoke && (
                        <button
                          type="button"
                          onClick={() => handleRevokeInvite(invite)}
                          disabled={revokeInviteId === invite.id}
                          className="px-3 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 transition text-sm disabled:opacity-60"
                        >
                          Отозвать
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
          </section>
          ) : null}

          {includePassword ? (
            <section className="panel rounded-3xl px-6 py-5 space-y-4">
        <div className="text-white/70 text-xs uppercase tracking-[0.25em]">Пароль</div>
        <form onSubmit={handlePasswordSubmit} className="space-y-3">
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="tg-input"
            placeholder="Текущий пароль"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="tg-input"
            placeholder="Новый пароль"
          />
          {passwordStatus && (
            <div className={passwordStatus.type === 'success' ? 'text-sky-300 text-xs' : 'text-red-400 text-xs'}>
              {passwordStatus.message}
            </div>
          )}
          <button
            type="submit"
            className="tg-button"
          >
            Сохранить пароль
          </button>
        </form>
          </section>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarSelect}
          />
          <input
            ref={profileBgInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleProfileBackgroundSelect}
          />
        </div>
      </div>

      {cropOpen && avatarPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6 py-10">
          <div className="panel w-full max-w-xl rounded-3xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <div className="text-lg font-semibold text-white/90">Обрезка аватара</div>
                <div className="text-xs text-white/60">Подгоните изображение под квадрат</div>
              </div>
              <button
                type="button"
                onClick={() => setCropOpen(false)}
                className="text-white/40 hover:text-white/80 transition"
              >
                x
              </button>
            </div>
            <div className="relative h-[360px] bg-black/40">
              <Cropper
                image={avatarPreview}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between gap-3">
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full accent-sky-400"
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCropOpen(false)}
                  className="tg-button text-sm"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={applyAvatarCrop}
                  className="tg-button tg-button--primary text-sm"
                >
                  Применить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {nameStyleOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-6"
          onClick={() => setNameStyleOpen(false)}
        >
          <div
            className="panel w-full max-w-5xl rounded-3xl overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="text-lg font-semibold text-white/90">Изменение стиля отображаемого имени</div>
              <button
                type="button"
                onClick={() => setNameStyleOpen(false)}
                className="text-white/40 hover:text-white/80 transition"
              >
                x
              </button>
            </div>
            <div className="grid gap-6 md:grid-cols-[260px_1fr] px-5 py-5">
              <div className="space-y-5">
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-white/50">Выбор шрифта</div>
                  <div className="grid grid-cols-3 gap-3">
                    {nameFontOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setDraftNameFont(option.id)}
                        className={`rounded-2xl px-3 py-3 border text-sm ${
                          draftNameFont === option.id ? 'border-sky-400 bg-white/10' : 'border-white/10 bg-white/5 hover:bg-white/10'
                        }`}
                        style={{ fontFamily: option.family }}
                      >
                        Gg
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-white/50">Выбор эффекта</div>
                  <div className="flex flex-wrap gap-2">
                    {nameEffectOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setDraftNameEffect(option.id)}
                        className={`tg-button text-sm ${
                          draftNameEffect === option.id ? 'tg-button--primary' : ''
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-white/50">Выбор цвета</div>
                  <div className="flex flex-wrap gap-2">
                    {nameColorOptions.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setDraftNameColor(color)}
                        className={`h-9 w-9 rounded-full border ${
                          draftNameColor === color ? 'border-white/80' : 'border-white/20'
                        }`}
                        style={{ background: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="text-xs uppercase tracking-[0.2em] text-white/50">Предпросмотр</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className={`h-24 w-full rounded-xl ${profileBackground ? 'bg-center bg-cover' : 'bg-gradient-to-r from-slate-800 to-slate-900'}`} style={profileBannerStyle} />
                  <div className="-mt-10 flex items-center gap-3">
                    <AvatarImage user={user} size={64} src={previewSrc} className="border border-white/10" />
                    <div>
                      <div className="text-base font-semibold" style={draftNameStyle}>
                        {displayName || user.displayName || user.username}
                      </div>
                      <div className="text-xs text-white/60">
                        {(displayName || user.displayName || user.username)} · {profileStatus || 'В сети'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 rounded-xl bg-white/5 p-3 text-xs text-white/60">
                    Пользователь находится в сети.
                  </div>
                  <button type="button" className="mt-4 w-full tg-button text-sm">
                    Пример кнопки
                  </button>
                </div>
                <div className="flex items-center justify-end gap-3">
                  <button type="button" onClick={() => setNameStyleOpen(false)} className="tg-button text-sm">
                    Отмена
                  </button>
                  <button type="button" onClick={applyNameStyle} className="tg-button tg-button--primary text-sm">
                    Применить
                  </button>
                </div>
                <div className="text-xs text-white/40">
                  Цвета и эффекты отображаются только в клиенте и зависят от темы.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {profileBgCropOpen && profileBgPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6 py-10">
          <div className="panel w-full max-w-2xl rounded-3xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <div className="text-lg font-semibold text-white/90">Фон профиля</div>
                <div className="text-xs text-white/60">Настройте позицию и масштаб</div>
              </div>
              <button
                type="button"
                onClick={closeProfileBgCrop}
                className="text-white/40 hover:text-white/80 transition"
              >
                x
              </button>
            </div>
            <div className="relative h-[320px] bg-black/40">
              <Cropper
                image={profileBgPreview}
                crop={profileBgCrop}
                zoom={profileBgZoom}
                aspect={3 / 1}
                onCropChange={setProfileBgCrop}
                onZoomChange={setProfileBgZoom}
                onCropComplete={onProfileBgCropComplete}
              />
            </div>
            <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between gap-3">
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={profileBgZoom}
                onChange={(e) => setProfileBgZoom(Number(e.target.value))}
                className="w-full accent-sky-400"
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={closeProfileBgCrop}
                  className="tg-button text-sm"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={applyProfileBackgroundCrop}
                  className="tg-button tg-button--primary text-sm"
                >
                  Применить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


