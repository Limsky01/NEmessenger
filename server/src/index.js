import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import http from 'http'
import { Server } from 'socket.io'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'
import path from 'path'
import multer from 'multer'
import crypto from 'crypto'

const app = express()
const server = http.createServer(app)
const origins = process.env.ORIGIN ? process.env.ORIGIN.split(',').map((s) => s.trim()) : ['*']
const io = new Server(server, { cors: { origin: origins, methods: ['GET', 'POST', 'DELETE'] } })

const timestamp = () => new Date().toISOString()
const log = (...args) => console.log(timestamp(), ...args)
const warn = (...args) => console.warn(timestamp(), ...args)
const logError = (...args) => console.error(timestamp(), ...args)

const resolveEncryptionKey = () => {
  const raw = process.env.ENCRYPTION_KEY || ''
  if (!raw) throw new Error('ENCRYPTION_KEY environment variable is required for encryption')
  let candidate = null
  try {
    const buf = Buffer.from(raw, 'base64')
    if (buf.length === 32) candidate = buf
  } catch (_) {}
  if (!candidate) {
    try {
      const buf = Buffer.from(raw, 'hex')
      if (buf.length === 32) candidate = buf
    } catch (_) {}
  }
  if (!candidate) throw new Error('ENCRYPTION_KEY must be a 32-byte key encoded in base64 or hex')
  return candidate
}

const DATA_ENCRYPTION_KEY = resolveEncryptionKey()
const ENCRYPTED_PREFIX = 'ENC1:'

const encryptText = (plain) => {
  const text = typeof plain === 'string' ? plain : String(plain ?? '')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', DATA_ENCRYPTION_KEY, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const payload = Buffer.concat([iv, tag, encrypted])
  return ENCRYPTED_PREFIX + payload.toString('base64')
}

const decryptText = (maybeEncrypted) => {
  if (!maybeEncrypted || typeof maybeEncrypted !== 'string') return maybeEncrypted
  if (!maybeEncrypted.startsWith(ENCRYPTED_PREFIX)) return maybeEncrypted
  try {
    const payload = Buffer.from(maybeEncrypted.slice(ENCRYPTED_PREFIX.length), 'base64')
    if (payload.length <= 28) return maybeEncrypted
    const iv = payload.subarray(0, 12)
    const tag = payload.subarray(12, 28)
    const ciphertext = payload.subarray(28)
    const decipher = crypto.createDecipheriv('aes-256-gcm', DATA_ENCRYPTION_KEY, iv)
    decipher.setAuthTag(tag)
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return decrypted.toString('utf8')
  } catch (err) {
    warn('[ENCRYPTION] decrypt text failed', err.message)
    return maybeEncrypted
  }
}

const createFileCipher = () => {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', DATA_ENCRYPTION_KEY, iv)
  return { cipher, iv }
}

const createFileDecipher = (ivBase64, tagBase64) => {
  if (!ivBase64 || !tagBase64) return null
  try {
    const iv = Buffer.from(ivBase64, 'base64')
    const tag = Buffer.from(tagBase64, 'base64')
    if (iv.length !== 12 || tag.length !== 16) return null
    const decipher = crypto.createDecipheriv('aes-256-gcm', DATA_ENCRYPTION_KEY, iv)
    decipher.setAuthTag(tag)
    return decipher
  } catch (err) {
    warn('[ENCRYPTION] init file decipher failed', err.message)
    return null
  }
}

const pipeFileToResponse = (file, res) => {
  const stream = fs.createReadStream(file.path)
  const handleStreamError = (err) => {
    warn('[FILES] stream error', err?.message || err)
    if (!res.headersSent) {
      try {
        res.status(500).end()
      } catch (_) {}
    } else {
      res.destroy(err)
    }
  }
  stream.on('error', handleStreamError)
  if (!file.iv || !file.auth_tag) {
    stream.pipe(res)
    return
  }
  const decipher = createFileDecipher(file.iv, file.auth_tag)
  if (!decipher) {
    stream.destroy()
    if (!res.headersSent) {
      try {
        res.status(500).end()
      } catch (_) {}
    } else {
      res.destroy(new Error('decrypt_init_failed'))
    }
    return
  }
  decipher.on('error', (err) => {
    warn('[ENCRYPTION] file decrypt failed', err?.message || err)
    stream.destroy(err)
    if (!res.headersSent) {
      try {
        res.status(500).end()
      } catch (_) {}
    } else {
      res.destroy(err)
    }
  })
  stream.pipe(decipher).pipe(res)
}

app.use(cors({ origin: origins, credentials: true }))
app.use(express.json({ limit: '5mb' }))

app.use((req, res, next) => {
  const start = Date.now()
  const origin = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown'
  log('[HTTP]', req.method, req.originalUrl, 'from=' + origin)
  res.on('finish', () => {
    log('[HTTP:done]', req.method, req.originalUrl, 'status=' + res.statusCode, (Date.now() - start) + 'ms')
  })
  next()
})

const PORT = process.env.PORT || 4000
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads'
const AVATAR_DIR = path.join(UPLOAD_DIR, 'avatars')

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })
if (!fs.existsSync(path.join(UPLOAD_DIR, 'tmp'))) fs.mkdirSync(path.join(UPLOAD_DIR, 'tmp'), { recursive: true })
if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true })

const db = new Database('messenger_v4.db')
db.pragma('journal_mode = WAL')

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  avatar_seed TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  uploader_id TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime TEXT,
  size INTEGER NOT NULL,
  path TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`)

try {
  db.prepare('ALTER TABLE users ADD COLUMN avatar_seed TEXT DEFAULT ""').run()
} catch (err) {}
try {
  db.prepare('ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT ""').run()
} catch (err) {}
try {
  db.prepare('ALTER TABLE users ADD COLUMN avatar_updated_at INTEGER DEFAULT 0').run()
} catch (err) {}
try {
  db.prepare('ALTER TABLE users ADD COLUMN avatar_mime TEXT DEFAULT ""').run()
} catch (err) {}
try {
  db.prepare('ALTER TABLE files ADD COLUMN iv TEXT DEFAULT ""').run()
} catch (err) {}
try {
  db.prepare('ALTER TABLE files ADD COLUMN auth_tag TEXT DEFAULT ""').run()
} catch (err) {}

db.prepare('UPDATE users SET avatar_seed = COALESCE(avatar_seed, substr(username,1,2))').run()

const selectUserById = db.prepare('SELECT * FROM users WHERE id=?')
const updateAvatarInfoStmt = db.prepare('UPDATE users SET avatar_url=?, avatar_updated_at=?, avatar_mime=? WHERE id=?')
const updatePasswordStmt = db.prepare('UPDATE users SET password_hash=? WHERE id=?')
const updateUserRoleStmt = db.prepare('UPDATE users SET role=? WHERE id=?')
const countAdminsStmt = db.prepare("SELECT COUNT(*) as count FROM users WHERE role='admin'")
const findMessageById = db.prepare('SELECT id, channel_id, sender_id FROM messages WHERE id=?')
const deleteMessageStmt = db.prepare('DELETE FROM messages WHERE id=?')

const decryptMessageRow = (row) => {
  if (!row) return row
  if (typeof row.content === 'undefined') return row
  return { ...row, content: decryptText(row.content) }
}

const decryptMessages = (rows) => rows.map(decryptMessageRow)

let defaultWs = db.prepare('SELECT id FROM workspaces LIMIT 1').get()
if (!defaultWs) {
  const wsId = uuidv4()
  db.prepare('INSERT INTO workspaces (id,name,created_at) VALUES (?,?,?)').run(wsId, 'Home', Date.now())
  const chId = uuidv4()
  db.prepare('INSERT INTO channels (id,workspace_id,name,created_at) VALUES (?,?,?,?)').run(chId, wsId, 'general', Date.now())
  defaultWs = { id: wsId }
}

const publicUser = (u) => {
  if (!u) return null
  const seed = u.avatar_seed ?? u.avatarSeed ?? ''
  const avatarPath = u.avatar_url ?? u.avatarUrl ?? ''
  const avatarUpdatedAt = u.avatar_updated_at ?? u.avatarUpdatedAt ?? 0
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    avatarSeed: seed,
    avatar_seed: seed,
    avatarUrl: avatarPath ? '/api/users/' + u.id + '/avatar' : '',
    avatar_url: avatarPath,
    avatarUpdatedAt,
    avatar_updated_at: avatarUpdatedAt,
  }
}

const fileMeta = (file) => {
  if (!file) return null
  return {
    id: file.id,
    name: file.original_name,
    mime: file.mime || '',
    size: file.size ?? 0,
  }
}

const buildDirectChannelId = (a, b) => `dm:${[a, b].sort().join(':')}`
const parseDirectChannelId = (channelId) => {
  if (!channelId || typeof channelId !== 'string') return null
  if (!channelId.startsWith('dm:')) return null
  const parts = channelId.split(':')
  if (parts.length !== 3) return null
  const [, rawA, rawB] = parts
  if (!rawA || !rawB) return null
  const [first, second] = [rawA, rawB].sort()
  return { first, second }
}
const normalizeDirectChannelId = (channelId) => {
  const parsed = parseDirectChannelId(channelId)
  if (!parsed) return null
  return buildDirectChannelId(parsed.first, parsed.second)
}
const isMemberOfDirectChannel = (channelId, userId) => {
  const parsed = parseDirectChannelId(channelId)
  if (!parsed) return false
  return parsed.first === userId || parsed.second === userId
}

const auth = (req, res, next) => {
  const hdr = req.headers.authorization || ''
  let token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null
  if (!token && req.query?.token) {
    token = req.query.token
    delete req.query.token
  }
  if (!token && req.headers['x-access-token']) token = req.headers['x-access-token']
  if (!token) {
    warn('[AUTH] no token provided', req.originalUrl)
    return res.status(401).json({ error: 'no_token' })
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    log('[AUTH] token verified', 'user=' + (req.user.username || req.user.id))
    next()
  } catch (e) {
    warn('[AUTH] invalid token', e.message)
    return res.status(401).json({ error: 'invalid_token' })
  }
}

const adminOnly = (req, res, next) => {
  const u = selectUserById.get(req.user.id)
  if (u?.role === 'admin') return next()
  return res.status(403).json({ error: 'forbidden' })
}

app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) {
    warn('[REGISTER] invalid payload', req.ip)
    return res.status(400).json({ error: 'username and password required' })
  }
  log('[REGISTER] attempt', username, 'ip=' + req.ip)
  const isFirstUser = !db.prepare('SELECT 1 FROM users LIMIT 1').get()
  const id = uuidv4()
  const hash = bcrypt.hashSync(password, 10)
  const role = isFirstUser ? 'admin' : 'user'
  const avatarSeed = username.slice(0, 2)
  try {
    db.prepare('INSERT INTO users (id,username,password_hash,role,avatar_seed) VALUES (?,?,?,?,?)').run(id, username, hash, role, avatarSeed)
  } catch (e) {
    warn('[REGISTER] username_taken', username)
    return res.status(400).json({ error: 'username_taken' })
  }
  db.prepare('INSERT OR IGNORE INTO workspace_members (workspace_id,user_id) VALUES (?,?)').run(defaultWs.id, id)
  const token = jwt.sign({ id, username, role, avatar_seed: avatarSeed }, JWT_SECRET, { expiresIn: '30d' })
  const user = publicUser({ id, username, role, avatar_seed: avatarSeed })
  log('[REGISTER] success', username, 'role=' + role)
  res.json({ token, user })
  io.emit('user:update', user)
})

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {}
  log('[LOGIN] attempt', username, 'ip=' + req.ip)
  const userRecord = db.prepare('SELECT * FROM users WHERE username=?').get(username)
  if (!userRecord) {
    warn('[LOGIN] invalid username', username)
    return res.status(401).json({ error: 'invalid_credentials' })
  }
  if (!bcrypt.compareSync(password, userRecord.password_hash)) {
    warn('[LOGIN] invalid password', username)
    return res.status(401).json({ error: 'invalid_credentials' })
  }
  db.prepare('INSERT OR IGNORE INTO workspace_members (workspace_id,user_id) VALUES (?,?)').run(defaultWs.id, userRecord.id)
  const token = jwt.sign({ id: userRecord.id, username: userRecord.username, role: userRecord.role, avatar_seed: userRecord.avatar_seed || '' }, JWT_SECRET, { expiresIn: '30d' })
  log('[LOGIN] success', username)
  res.json({ token, user: publicUser(userRecord) })
})

app.get('/api/users', auth, (req, res) => {
  const users = db
    .prepare('SELECT id, username, role, avatar_seed, avatar_url, avatar_updated_at FROM users ORDER BY username ASC')
    .all()
  log('[USERS] list', 'by=' + req.user.id, 'count=' + users.length)
  res.json({ users: users.map(publicUser) })
})

app.get('/api/profile', auth, (req, res) => {
  const user = selectUserById.get(req.user.id)
  if (!user) {
    warn('[PROFILE] not found', req.user.id)
    return res.status(404).json({ error: 'not_found' })
  }
  log('[PROFILE] fetch', 'user=' + req.user.id)
  res.json({ profile: publicUser(user) })
})

app.post('/api/profile/avatar', auth, (req, res) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) {
      logError('avatar upload failed', err)
      const code = err.code === 'LIMIT_FILE_SIZE' ? 'avatar_too_large' : 'invalid_avatar'
      return res.status(400).json({ error: code })
    }
    if (!req.file) {
      warn('[AVATAR] empty upload', req.user.id)
      return res.status(400).json({ error: 'invalid_avatar' })
    }

    const existing = selectUserById.get(req.user.id)
    if (!existing) return res.status(404).json({ error: 'not_found' })

    const relPath = path.relative(UPLOAD_DIR, req.file.path)
    const previousPath = existing.avatar_url ? path.join(UPLOAD_DIR, existing.avatar_url) : null

    updateAvatarInfoStmt.run(relPath, Date.now(), req.file.mimetype || '', req.user.id)
    log('[AVATAR] updated', req.user.id, req.file.originalname || req.file.filename)

    if (previousPath && fs.existsSync(previousPath) && previousPath !== req.file.path) {
      try {
        fs.unlinkSync(previousPath)
      } catch (e) {
        warn('avatar cleanup failed', e.message)
      }
    }

    const updated = selectUserById.get(req.user.id)
    const payload = publicUser(updated)
    io.emit('user:update', payload)
    res.json({ user: payload })
  })
})

app.get('/api/users/:id/avatar', (req, res) => {
  const user = selectUserById.get(req.params.id)
  if (!user?.avatar_url) {
    warn('[AVATAR] not found', 'target=' + req.params.id)
    return res.status(404).json({ error: 'not_found' })
  }
  const avatarPath = path.resolve(path.join(UPLOAD_DIR, user.avatar_url))
  const uploadsRoot = path.resolve(UPLOAD_DIR)
  if (!avatarPath.startsWith(uploadsRoot)) return res.status(403).json({ error: 'forbidden' })
  if (!fs.existsSync(avatarPath)) {
    warn('[AVATAR] missing file', 'target=' + req.params.id)
    return res.status(404).json({ error: 'missing_file' })
  }
  if (user.avatar_updated_at) res.setHeader('Last-Modified', new Date(user.avatar_updated_at).toUTCString())
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  log('[AVATAR] served', 'target=' + req.params.id, 'file=' + path.basename(avatarPath))
  res.sendFile(avatarPath)
})
app.post('/api/profile/password', auth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {}
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'invalid_payload' })
  if (newPassword.length < 6) return res.status(400).json({ error: 'password_too_short' })
  const user = selectUserById.get(req.user.id)
  if (!user) {
    warn('[PROFILE] not found', req.user.id)
    return res.status(404).json({ error: 'not_found' })
  }
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) return res.status(401).json({ error: 'invalid_current_password' })
  const hash = bcrypt.hashSync(newPassword, 10)
  updatePasswordStmt.run(hash, req.user.id)
  log('[PROFILE] password changed', req.user.id)
  res.json({ ok: true })
})

app.get('/api/admin/files', auth, adminOnly, (req, res) => {
  log('[ADMIN] files:list', 'admin=' + req.user.id)
  res.json({ files: db.prepare('SELECT * FROM files ORDER BY created_at DESC').all() })
})
app.delete('/api/admin/files/:id', auth, adminOnly, (req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id=?').get(req.params.id)
  if (!f) {
    warn('[ADMIN] file:missing', 'admin=' + req.user.id, 'id=' + req.params.id)
    return res.status(404).json({ error: 'not_found' })
  }
  try {
    fs.unlinkSync(f.path)
  } catch (e) {}
  db.prepare('DELETE FROM files WHERE id=?').run(req.params.id)
  log('[ADMIN] file:deleted', 'admin=' + req.user.id, 'id=' + req.params.id)
  res.json({ ok: true })
})
app.delete('/api/admin/users/:id', auth, adminOnly, (req, res) => {
  const id = req.params.id
  const existing = selectUserById.get(id)
  if (!existing) return res.status(404).json({ error: 'not_found' })
  if (existing.role === 'admin') {
    const totalAdmins = countAdminsStmt.get()?.count || 0
    if (totalAdmins <= 1) return res.status(400).json({ error: 'last_admin' })
  }
  if (existing.avatar_url) {
    const avatarPath = path.resolve(path.join(UPLOAD_DIR, existing.avatar_url))
    const uploadsRoot = path.resolve(UPLOAD_DIR)
    if (avatarPath.startsWith(uploadsRoot) && fs.existsSync(avatarPath)) {
      try {
        fs.unlinkSync(avatarPath)
      } catch (err) {
        warn('[ADMIN] avatar cleanup failed', err.message)
      }
    }
  }
  db.prepare('DELETE FROM messages WHERE sender_id=?').run(id)
  db.prepare('DELETE FROM workspace_members WHERE user_id=?').run(id)
  db.prepare('DELETE FROM users WHERE id=?').run(id)
  const sid = onlineUsers.get(id)
  if (sid) {
    onlineUsers.delete(id)
    const socket = io.sockets.sockets.get(sid)
    if (socket) {
      try {
        socket.disconnect(true)
      } catch (err) {
        warn('[ADMIN] disconnect failed', err.message)
      }
    }
    io.emit('presence:update', { onlineUserIds: Array.from(onlineUsers.keys()) })
  }
  log('[ADMIN] user:deleted', 'admin=' + req.user.id, 'target=' + id)
  res.json({ ok: true })
})

app.patch('/api/admin/users/:id/role', auth, adminOnly, (req, res) => {
  const id = req.params.id
  const { role } = req.body || {}
  if (!role || (role !== 'admin' && role !== 'user')) return res.status(400).json({ error: 'invalid_role' })
  const existing = selectUserById.get(id)
  if (!existing) return res.status(404).json({ error: 'not_found' })
  if (existing.role === role) return res.json({ user: publicUser(existing) })
  if (existing.role === 'admin' && role !== 'admin') {
    const totalAdmins = countAdminsStmt.get()?.count || 0
    if (totalAdmins <= 1) return res.status(400).json({ error: 'last_admin' })
  }
  updateUserRoleStmt.run(role, id)
  const updated = selectUserById.get(id)
  const payload = publicUser(updated)
  io.emit('user:update', payload)
  log('[ADMIN] role:update', 'admin=' + req.user.id, 'target=' + id, 'role=' + role)
  res.json({ user: payload })
})

app.post('/api/admin/users/:id/password', auth, adminOnly, (req, res) => {
  const id = req.params.id
  const { newPassword } = req.body || {}
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6)
    return res.status(400).json({ error: 'password_too_short' })
  const existing = selectUserById.get(id)
  if (!existing) return res.status(404).json({ error: 'not_found' })
  const hash = bcrypt.hashSync(newPassword, 10)
  updatePasswordStmt.run(hash, id)
  log('[ADMIN] password:reset', 'admin=' + req.user.id, 'target=' + id)
  res.json({ ok: true })
})

app.delete('/api/admin/users/:id/avatar', auth, adminOnly, (req, res) => {
  const id = req.params.id
  const existing = selectUserById.get(id)
  if (!existing) return res.status(404).json({ error: 'not_found' })
  if (existing.avatar_url) {
    const avatarPath = path.resolve(path.join(UPLOAD_DIR, existing.avatar_url))
    const uploadsRoot = path.resolve(UPLOAD_DIR)
    if (avatarPath.startsWith(uploadsRoot) && fs.existsSync(avatarPath)) {
      try {
        fs.unlinkSync(avatarPath)
      } catch (err) {
        warn('[ADMIN] avatar delete failed', err.message)
      }
    }
  }
  updateAvatarInfoStmt.run('', 0, '', id)
  const updated = selectUserById.get(id)
  const payload = publicUser(updated)
  io.emit('user:update', payload)
  log('[ADMIN] avatar:deleted', 'admin=' + req.user.id, 'target=' + id)
  res.json({ user: payload })
})

const avatarStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const target = path.join(AVATAR_DIR, req.user.id)
    fs.mkdirSync(target, { recursive: true })
    cb(null, target)
  },
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname || '') || '.png').toLowerCase()
    const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.webp']
    const safeExt = allowed.includes(ext) ? ext : '.png'
    const name = Date.now().toString() + safeExt
    cb(null, name)
  },
})

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file?.mimetype?.startsWith('image/')) {
      cb(new Error('invalid_avatar_type'))
      return
    }
    cb(null, true)
  },
})

const upload = multer({ storage: multer.memoryStorage() })

app.post('/api/upload/init', auth, (req, res) => {
  const { filename, size } = req.body || {}
  if (!filename || !size) return res.status(400).json({ error: 'bad_request' })
  const id = uuidv4()
  const tmpDir = path.join(UPLOAD_DIR, 'tmp', id)
  fs.mkdirSync(tmpDir, { recursive: true })
  log('[UPLOAD] init', 'user=' + req.user.id, 'upload=' + id, 'name=' + filename, 'size=' + size)
  res.json({ uploadId: id })
})

app.post('/api/upload/chunk', auth, upload.single('chunk'), (req, res) => {
  const { uploadId, index } = req.body || {}
  if (!uploadId || typeof index === 'undefined') return res.status(400).json({ error: 'bad_request' })
  const tmpDir = path.join(UPLOAD_DIR, 'tmp', uploadId)
  if (!fs.existsSync(tmpDir)) return res.status(400).json({ error: 'no_session' })
  const chunkPath = path.join(tmpDir, `chunk_${index}`)
  fs.writeFileSync(chunkPath, req.file.buffer)
  log('[UPLOAD] chunk', 'user=' + req.user.id, 'upload=' + uploadId, 'index=' + index, 'bytes=' + (req.file?.buffer?.length || 0))
  res.json({ ok: true })
})

app.post('/api/upload/complete', auth, (req, res) => {
  const { uploadId, filename, mime } = req.body || {}
  if (!uploadId || !filename) return res.status(400).json({ error: 'bad_request' })
  const tmpDir = path.join(UPLOAD_DIR, 'tmp', uploadId)
  if (!fs.existsSync(tmpDir)) return res.status(400).json({ error: 'no_session' })
  const chunks = fs
    .readdirSync(tmpDir)
    .filter((n) => n.startsWith('chunk_'))
    .sort((a, b) => parseInt(a.split('_')[1], 10) - parseInt(b.split('_')[1], 10))
  if (!chunks.length) return res.status(400).json({ error: 'no_chunks' })

  const safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, '_')
  const finalId = uuidv4()
  const finalPath = path.join(UPLOAD_DIR, `${finalId}_${safeName}`)
  const { cipher, iv } = createFileCipher()
  let authTagBase64 = ''
  let plaintextSize = 0
  let fd
  try {
    fd = fs.openSync(finalPath, 'w')
    for (const chunkName of chunks) {
      const chunkPath = path.join(tmpDir, chunkName)
      const data = fs.readFileSync(chunkPath)
      plaintextSize += data.length
      const encryptedPart = cipher.update(data)
      if (encryptedPart.length) fs.writeSync(fd, encryptedPart)
    }
    const finalEncrypted = cipher.final()
    if (finalEncrypted.length) fs.writeSync(fd, finalEncrypted)
    authTagBase64 = cipher.getAuthTag().toString('base64')
  } catch (err) {
    warn('[UPLOAD] encryption failed', err.message)
    try {
      if (fd) fs.closeSync(fd)
    } catch (_) {}
    try { fs.unlinkSync(finalPath) } catch (_) {}
    fs.rmSync(tmpDir, { recursive: true, force: true })
    return res.status(500).json({ error: 'merge_failed' })
  } finally {
    try {
      if (fd) fs.closeSync(fd)
    } catch (_) {}
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }

  db.prepare('INSERT INTO files (id,uploader_id,original_name,mime,size,path,created_at,iv,auth_tag) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(finalId, req.user.id, filename, mime || '', plaintextSize, finalPath, Date.now(), iv.toString('base64'), authTagBase64)
  log('[UPLOAD] complete', 'user=' + req.user.id, 'upload=' + uploadId, 'file=' + finalId, 'name=' + filename, 'size=' + plaintextSize)
  res.json({ file: { id: finalId, name: filename, mime: mime || '', size: plaintextSize } })
})

app.get('/api/files/:id/meta', auth, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id=?').get(req.params.id)
  if (!file) return res.status(404).json({ error: 'not_found' })
  log('[FILES] meta', 'user=' + req.user.id, 'file=' + req.params.id)
  res.json({ file: fileMeta(file) })
})

app.get('/api/files/:id', auth, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id=?').get(req.params.id)
  if (!file) return res.status(404).json({ error: 'not_found' })
  if (!file.path || !fs.existsSync(file.path)) return res.status(404).json({ error: 'missing_file' })
  log('[FILES] download', 'user=' + req.user.id, 'file=' + req.params.id, 'name=' + file.original_name)
  res.setHeader('Content-Type', file.mime || 'application/octet-stream')
  res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`)
  if (typeof file.size === 'number' && Number.isFinite(file.size)) res.setHeader('Content-Length', file.size)
  pipeFileToResponse(file, res)
})

app.get('/api/files/:id/view', auth, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id=?').get(req.params.id)
  if (!file) return res.status(404).json({ error: 'not_found' })
  if (!file.path || !fs.existsSync(file.path)) return res.status(404).json({ error: 'missing_file' })
  log('[FILES] inline', 'user=' + req.user.id, 'file=' + req.params.id, 'name=' + file.original_name)
  res.setHeader('Content-Type', file.mime || 'application/octet-stream')
  res.setHeader('Content-Disposition', `inline; filename="${file.original_name}"`)
  if (typeof file.size === 'number' && Number.isFinite(file.size)) res.setHeader('Content-Length', file.size)
  pipeFileToResponse(file, res)
})

app.delete('/api/messages/:id', auth, (req, res) => {
  const message = findMessageById.get(req.params.id)
  if (!message) return res.status(404).json({ error: 'not_found' })
  if (message.sender_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' })
  deleteMessageStmt.run(message.id)
  io.to(message.channel_id).emit('message:deleted', { id: message.id, channelId: message.channel_id })
  log('[MESSAGE] delete', 'user=' + req.user.id, 'message=' + message.id, 'channel=' + message.channel_id)
  res.json({ ok: true })
})

const onlineUsers = new Map()
const listChannels = db.prepare('SELECT * FROM channels WHERE workspace_id=? ORDER BY created_at ASC')
const listMessages = db.prepare('SELECT * FROM messages WHERE channel_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?')
const insertMessage = db.prepare('INSERT INTO messages (id,channel_id,sender_id,content,created_at) VALUES (?,?,?,?,?)')

io.use((socket, next) => {
  const token = socket.handshake.auth?.token
  if (!token) return next(new Error('no_token'))
  try {
    socket.user = jwt.verify(token, JWT_SECRET)
    log('[SOCKET] handshake', 'user=' + (socket.user.username || socket.user.id))
    next()
  } catch (e) {
    warn('[SOCKET] invalid token', e.message)
    next(new Error('invalid_token'))
  }
})

io.on('connection', (socket) => {
  const userId = socket.user.id
  onlineUsers.set(userId, socket.id)
  io.emit('presence:update', { onlineUserIds: Array.from(onlineUsers.keys()) })
  log('[SOCKET] connected', 'user=' + userId, 'socket=' + socket.id)

  const wsId = db.prepare('SELECT id FROM workspaces LIMIT 1').get().id
  const channels = listChannels.all(wsId)
  const activeChannelId = channels[0]?.id
  if (activeChannelId) socket.join(activeChannelId)

  socket.on('init:request', ({ limit = 50, offset = 0 } = {}) => {
    log('[SOCKET] init:request', 'user=' + userId, 'limit=' + limit, 'offset=' + offset)
    const messages = activeChannelId ? decryptMessages(listMessages.all(activeChannelId, limit, offset)).reverse() : []
    socket.emit('init:response', { workspaces: [{ id: wsId, name: 'Home' }], channels, activeChannelId, messages })
  })

  socket.on('channel:switch', ({ channelId }) => {
    if (!channelId) return
    log('[SOCKET] channel:switch', 'user=' + userId, 'channel=' + channelId)
    if (channelId.startsWith('dm:')) {
      if (!isMemberOfDirectChannel(channelId, userId)) return
      const normalized = normalizeDirectChannelId(channelId)
      if (!normalized) return
      for (const room of socket.rooms) if (room !== socket.id) socket.leave(room)
      socket.join(normalized)
      const msgs = decryptMessages(listMessages.all(normalized, 50, 0)).reverse()
      socket.emit('channel:opened', { channelId: normalized, messages: msgs })
      return
    }
    for (const room of socket.rooms) if (room !== socket.id) socket.leave(room)
    socket.join(channelId)
    const msgs = decryptMessages(listMessages.all(channelId, 50, 0)).reverse()
    socket.emit('channel:opened', { channelId, messages: msgs })
  })

  socket.on('message:send', ({ channelId, content }) => {
    if (!channelId || !content) return
    let targetChannel = channelId
    let directParticipants = null
    if (channelId.startsWith('dm:')) {
      if (!isMemberOfDirectChannel(channelId, userId)) return
      const normalized = normalizeDirectChannelId(channelId)
      if (!normalized) return
      targetChannel = normalized
      const parsed = parseDirectChannelId(channelId)
      directParticipants = parsed ? [parsed.first, parsed.second] : null
    }
    const id = uuidv4()
    const now = Date.now()
    const encryptedContent = encryptText(content)
    insertMessage.run(id, targetChannel, userId, encryptedContent, now)
    const payload = { id, channelId: targetChannel, senderId: userId, content, createdAt: now }
    io.to(targetChannel).emit('message:new', payload)
    log('[MESSAGE] send', 'user=' + userId, 'channel=' + targetChannel, 'bytes=' + Buffer.byteLength(content, 'utf8'))
    if (directParticipants) {
      const room = io.sockets.adapter.rooms.get(targetChannel) || new Set()
      directParticipants.forEach((participantId) => {
        const sid = onlineUsers.get(participantId)
        if (!sid) return
        if (room.has(sid)) return
        io.to(sid).emit('message:new', payload)
      })
    }
  })

  socket.on('messages:load', ({ channelId, limit = 50, offset = 0 }) => {
    if (!channelId) return
    log('[SOCKET] messages:load', 'user=' + userId, 'channel=' + channelId, 'limit=' + limit, 'offset=' + offset)
    let targetChannel = channelId
    if (channelId.startsWith('dm:')) {
      if (!isMemberOfDirectChannel(channelId, userId)) return
      const normalized = normalizeDirectChannelId(channelId)
      if (!normalized) return
      targetChannel = normalized
    }
    const msgs = decryptMessages(listMessages.all(targetChannel, limit, offset)).reverse()
    socket.emit('messages:page', { channelId: targetChannel, messages: msgs, offset, limit })
  })

  socket.on('disconnect', () => {
    onlineUsers.delete(userId)
    io.emit('presence:update', { onlineUserIds: Array.from(onlineUsers.keys()) })
    log('[SOCKET] disconnected', 'user=' + userId, 'socket=' + socket.id)
  })
})

process.on('unhandledRejection', (reason) => {
  logError('Unhandled rejection', reason)
})

server.listen(PORT, () => log('Server listening on', PORT))









