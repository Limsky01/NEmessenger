import Database from 'better-sqlite3'
const db = new Database('messenger_e2e.db')
try{
  const rows = db.prepare('SELECT id, username FROM users').all()
  if(!rows || rows.length===0){
    console.log('NO_USERS')
  } else {
    console.log('USER_COUNT', rows.length)
    rows.forEach(r=>console.log(r.id, r.username))
  }
}catch(e){
  console.error('DB_ERR', e.message)
}
