import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const overlayVariants = {
  initial: { opacity: 0, backdropFilter: 'blur(0px)' },
  animate: {
    opacity: 1,
    backdropFilter: 'blur(22px)',
    transition: { duration: 0.45, ease: [0.4, 0, 0.2, 1] },
  },
  exit: {
    opacity: 0,
    backdropFilter: 'blur(0px)',
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
}

const cardVariants = {
  initial: { opacity: 0, scale: 0.92, filter: 'blur(16px)' },
  animate: {
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)',
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    opacity: 0,
    scale: 0.9,
    filter: 'blur(12px)',
    transition: { duration: 0.45, ease: [0.4, 0, 0.2, 1] },
  },
}

const gradientTransition = {
  duration: 12,
  repeat: Infinity,
  ease: 'linear',
}

const orbTransition = {
  duration: 1.2,
  repeat: Infinity,
  repeatType: 'mirror',
  ease: [0.66, 0, 0.34, 1],
}

export default function SplashScreen({
  showSplash,
  onExitComplete,
  heading = 'Загрузка',
  subheading = 'Подготовка данных…',
  statusText = '',
  secondaryActionLabel,
  onSecondaryAction,
  tertiaryActionLabel,
  onTertiaryAction,
}) {
  return (
    <AnimatePresence onExitComplete={onExitComplete}>
      {showSplash && (
        <motion.div
          className="splash-overlay"
          variants={overlayVariants}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          <motion.div
            className="splash-gradient splash-gradient-one"
            animate={{ rotate: [0, 360] }}
            transition={{ ...gradientTransition, duration: 18 }}
          />
          <motion.div
            className="splash-gradient splash-gradient-two"
            animate={{ rotate: [360, 0] }}
            transition={gradientTransition}
          />
          <motion.div
            className="splash-noise"
            animate={{ opacity: [0.2, 0.35, 0.2] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          />

          <motion.div className="splash-card glass" variants={cardVariants} initial="initial" animate="animate" exit="exit">
            <motion.div
              className="splash-ring"
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
            >
              <motion.div
                className="splash-orb"
                animate={{ scale: [1, 1.18, 1], opacity: [0.85, 1, 0.85] }}
                transition={orbTransition}
              />
            </motion.div>

            <motion.span
              className="splash-kicker"
              animate={{ opacity: [0.6, 1, 0.6], letterSpacing: ['0.4em', '0.45em', '0.4em'] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              NEMESSENGER
            </motion.span>

            <motion.h1
              className="splash-heading"
              animate={{ scale: [1, 1.02, 1], textShadow: ['0 0 20px rgba(56, 189, 248, .45)', '0 0 24px rgba(125, 211, 252, .7)', '0 0 20px rgba(56, 189, 248, .45)'] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
            >
              {heading}
            </motion.h1>

            <motion.p
              className="splash-subheading"
              animate={{ opacity: [0.45, 0.8, 0.45] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            >
              {subheading}
            </motion.p>

            {statusText ? (
              <motion.p
                className="mt-3 text-sm text-center text-white/80 leading-relaxed"
                animate={{ opacity: [0.45, 0.75, 0.45] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              >
                {statusText}
              </motion.p>
            ) : null}

            {secondaryActionLabel && onSecondaryAction ? (
              <div className="flex flex-col sm:flex-row gap-3 mt-4">
                <button
                  type="button"
                  className="tg-button relative z-10 flex-1"
                  onClick={onSecondaryAction}
                >
                  {secondaryActionLabel}
                </button>
                {tertiaryActionLabel && onTertiaryAction ? (
                  <button
                    type="button"
                    className="tg-button relative z-10 flex-1"
                    onClick={onTertiaryAction}
                  >
                    {tertiaryActionLabel}
                  </button>
                ) : null}
              </div>
            ) : null}

            <motion.div
              className="splash-progress"
              animate={{ width: ['12%', '68%', '42%', '96%'] }}
              transition={{ duration: 5.4, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
