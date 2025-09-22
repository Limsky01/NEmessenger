import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import multer from 'multer';

const app = express();
const server = http.createServer(app);
const origins = process.env.ORIGIN ? process.env.ORIGIN.split(',').map(s=>s.trim()) : ['*'];
const io = new Server(server, { cors: { origin: origins, methods: ['GET','POST'] } });
app.use(cors({ origin: origins, credentials: true }));
app.use(express.json({ limit: '5mb' }));

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(path.join(UPLOAD_DIR,'tmp'))) fs.mkdirSync(path.join(UPLOAD_DIR,'tmp'), { recursive: true });

const db = new Database('messenger_v4.db');
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' -- 'user' | 'admin'
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
`);

// seed default workspace/channel
let defaultWs = db.prepare("SELECT id FROM workspaces LIMIT 1").get();
if (!defaultWs) {
  const wsId = uuidv4();
  db.prepare("INSERT INTO workspaces (id,name,created_at) VALUES (?,?,?)").run(wsId, 'Home', Date.now());
  const chId = uuidv4();
  db.prepare("INSERT INTO channels (id,workspace_id,name,created_at) VALUES (?,?,?,?)").run(chId, wsId, 'general', Date.now());
  defaultWs = { id: wsId };
}

const publicUser = (u) => ({ id: u.id, username: u.username, role: u.role });

// ------- Auth helpers -------
const auth = (req,res,next)=>{
  const hdr = req.headers.authorization||'';
  const token = hdr.startsWith('Bearer ')? hdr.slice(7): null;
  if(!token) return res.status(401).json({ error:'no_token' });
  try{ req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch(e){ return res.status(401).json({ error:'invalid_token' }) }
};
const adminOnly = (req,res,next)=>{
  const u = db.prepare("SELECT role FROM users WHERE id=?").get(req.user.id);
  if (u?.role==='admin') return next();
  return res.status(403).json({ error:'forbidden' });
};

// ------- REST: auth -------
app.post('/api/register', (req,res)=>{
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required'});
  const isFirstUser = !db.prepare("SELECT 1 FROM users LIMIT 1").get();
  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  const role = isFirstUser? 'admin':'user';
  try { db.prepare("INSERT INTO users (id,username,password_hash,role) VALUES (?,?,?,?)").run(id,username,hash,role); }
  catch(e){ return res.status(400).json({ error: 'username_taken' }); }
  db.prepare("INSERT OR IGNORE INTO workspace_members (workspace_id,user_id) VALUES (?,?)").run(defaultWs.id, id);
  const token = jwt.sign({ id, username, role }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id, username, role } });
});

app.post('/api/login', (req,res)=>{
  const { username, password } = req.body || {};
  const u = db.prepare("SELECT * FROM users WHERE username=?").get(username);
  if (!u) return res.status(401).json({ error:'invalid_credentials' });
  if (!bcrypt.compareSync(password, u.password_hash)) return res.status(401).json({ error:'invalid_credentials' });
  db.prepare("INSERT OR IGNORE INTO workspace_members (workspace_id,user_id) VALUES (?,?)").run(defaultWs.id, u.id);
  const token = jwt.sign({ id: u.id, username: u.username, role: u.role }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: publicUser(u) });
});

app.get('/api/users', auth, (req,res)=>{
  res.json({ users: db.prepare("SELECT id, username, role FROM users ORDER BY username ASC").all() });
});

// ------- Admin APIs -------
app.get('/api/admin/files', auth, adminOnly, (req,res)=>{
  res.json({ files: db.prepare("SELECT * FROM files ORDER BY created_at DESC").all() });
});
app.delete('/api/admin/files/:id', auth, adminOnly, (req,res)=>{
  const f = db.prepare("SELECT * FROM files WHERE id=?").get(req.params.id);
  if (!f) return res.status(404).json({ error:'not_found' });
  try { fs.unlinkSync(f.path); } catch(e){}
  db.prepare("DELETE FROM files WHERE id=?").run(req.params.id);
  res.json({ ok:true });
});
app.delete('/api/admin/users/:id', auth, adminOnly, (req,res)=>{
  const id = req.params.id;
  db.prepare("DELETE FROM messages WHERE sender_id=?").run(id);
  db.prepare("DELETE FROM workspace_members WHERE user_id=?").run(id);
  db.prepare("DELETE FROM users WHERE id=?").run(id);
  res.json({ ok:true });
});

// ------- Chunked File Upload (10GB) -------
const upload = multer({ storage: multer.memoryStorage() }); // we'll write buffer to disk stream per chunk

app.post('/api/upload/init', auth, (req,res)=>{
  const { filename, size, mime } = req.body||{};
  if (!filename || !size) return res.status(400).json({ error:'bad_request' });
  const id = uuidv4();
  const tmpDir = path.join(UPLOAD_DIR,'tmp',id);
  fs.mkdirSync(tmpDir, { recursive:true });
  res.json({ uploadId: id });
});

app.post('/api/upload/chunk', auth, upload.single('chunk'), (req,res)=>{
  const { uploadId, index } = req.body||{};
  if (!uploadId || typeof index==='undefined') return res.status(400).json({ error:'bad_request' });
  const tmpDir = path.join(UPLOAD_DIR,'tmp',uploadId);
  if (!fs.existsSync(tmpDir)) return res.status(400).json({ error:'no_session' });
  const filePath = path.join(tmpDir, 'chunk_'+index);
  fs.writeFileSync(filePath, req.file.buffer);
  res.json({ ok:true });
});

app.post('/api/upload/complete', auth, (req,res)=>{
  const { uploadId, filename, mime } = req.body||{};
  const tmpDir = path.join(UPLOAD_DIR,'tmp',uploadId);
  if (!fs.existsSync(tmpDir)) return res.status(400).json({ error:'no_session' });
  const chunks = fs.readdirSync(tmpDir).filter(n=>n.startsWith('chunk_')).sort((a,b)=>{
    const ai = parseInt(a.split('_')[1]); const bi = parseInt(b.split('_')[1]);
    return ai - bi;
  });
  const finalId = uuidv4();
  const finalPath = path.join(UPLOAD_DIR, finalId+'_'+filename);
  const write = fs.createWriteStream(finalPath);
  for (const ch of chunks){
    const data = fs.readFileSync(path.join(tmpDir,ch));
    write.write(data);
  }
  write.end();
  fs.rmSync(tmpDir, { recursive:true, force:true });
  const size = fs.statSync(finalPath).size;
  db.prepare("INSERT INTO files (id,uploader_id,original_name,mime,size,path,created_at) VALUES (?,?,?,?,?,?,?)")
    .run(finalId, req.user.id, filename, mime||'', size, finalPath, Date.now());
  res.json({ fileId: finalId });
});

app.get('/api/files/:id', auth, (req,res)=>{
  const f = db.prepare("SELECT * FROM files WHERE id=?").get(req.params.id);
  if (!f) return res.status(404).end();
  res.setHeader('Content-Type', f.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${f.original_name}"`);
  fs.createReadStream(f.path).pipe(res);
});

// ------- Socket.IO -------
const onlineUsers = new Map();
const listChannels = db.prepare("SELECT * FROM channels WHERE workspace_id=? ORDER BY created_at ASC");
const listMessages = db.prepare("SELECT * FROM messages WHERE channel_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?");
const insertMessage = db.prepare("INSERT INTO messages (id,channel_id,sender_id,content,created_at) VALUES (?,?,?,?,?)");

io.use((socket,next)=>{
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('no_token'));
  try { socket.user = jwt.verify(token, JWT_SECRET); next(); }
  catch(e){ next(new Error('invalid_token')); }
});

io.on('connection', (socket)=>{
  const userId = socket.user.id;
  onlineUsers.set(userId, socket.id);
  io.emit('presence:update', { onlineUserIds: Array.from(onlineUsers.keys()) });

  const wsId = db.prepare("SELECT id FROM workspaces LIMIT 1").get().id;
  const channels = listChannels.all(wsId);
  const activeChannelId = channels[0]?.id;
  if (activeChannelId) socket.join(activeChannelId);

  socket.on('init:request', ({ limit=50, offset=0 }={})=>{
    const messages = activeChannelId ? listMessages.all(activeChannelId, limit, offset).reverse() : [];
    socket.emit('init:response', { workspaces:[{ id: wsId, name:'Home' }], channels, activeChannelId, messages });
  });

  socket.on('channel:switch', ({ channelId })=>{
    if (!channelId) return;
    for (const r of socket.rooms) if (r!==socket.id) socket.leave(r);
    socket.join(channelId);
    const msgs = listMessages.all(channelId, 50, 0).reverse();
    socket.emit('channel:opened', { channelId, messages: msgs });
  });

  socket.on('message:send', ({ channelId, content })=>{
    if (!channelId || !content) return;
    const id = uuidv4();
    const now = Date.now();
    insertMessage.run(id, channelId, userId, content, now);
    const payload = { id, channelId, senderId: userId, content, createdAt: now };
    io.to(channelId).emit('message:new', payload);
  });

  socket.on('messages:load', ({ channelId, limit=50, offset=0 })=>{
    const msgs = listMessages.all(channelId, limit, offset).reverse();
    socket.emit('messages:page', { channelId, messages: msgs, offset, limit });
  });

  socket.on('disconnect', ()=>{
    onlineUsers.delete(userId);
    io.emit('presence:update', { onlineUserIds: Array.from(onlineUsers.keys()) });
  });
});

server.listen(PORT, ()=> console.log('Server listening on', PORT));
