import React, { useEffect, useState } from 'react'
import useStore from '../state/store.js'

export default function AdminPanel(){
  const [tab, setTab] = useState('files')
  return (
    <div className="w-[360px] border-l border-white/10 bg-white/5 backdrop-blur-md h-full flex flex-col">
      <div className="p-4 panel sticky top-0 flex items-center justify-between">
        <div className="text-[13px] tracking-widest opacity-80">АДМИН</div>
        <div className="flex gap-2">
          <button className={`px-3 py-1 rounded-xl ${tab==='files'?'panel':'glass'}`} onClick={()=>setTab('files')}>Файлы</button>
          <button className={`px-3 py-1 rounded-xl ${tab==='users'?'panel':'glass'}`} onClick={()=>setTab('users')}>Пользователи</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {tab==='files'? <ФайлыTab/> : <ПользователиTab/>}
      </div>
    </div>
  )
}

function ФайлыTab(){
  const fetchФайлы = useStore(s=>s.fetchФайлы)
  const deleteFile = useStore(s=>s.deleteFile)
  const [list,setList]=useState([])
  const refresh = async ()=> setList(await fetchФайлы())
  useEffect(()=>{ refresh() },[])
  return (
    <div className="space-y-2">
      {list.map(f=>(
        <div key={f.id} className="panel rounded-2xl px-3 py-2 flex items-center justify-between">
          <div className="text-sm">
            <div>{f.original_name}</div>
            <div className="text-xs text-white/60">{(f.size/1024/1024).toFixed(2)} МБ</div>
          </div>
          <div className="flex gap-2">
            <a className="px-3 py-1 rounded-xl bg-white/10 hover:bg-white/20" href="#" onClick={(e)=>{e.preventDefault(); const url=useStore.getState().serverUrl+`/api/files/${f.id}`; const token=useStore.getState().token; window.open(url+'?token='+token,'_blank')}}>Открыть</a>
            <button className="px-3 py-1 rounded-xl bg-white/10 hover:bg-white/20" onClick={async ()=>{ await deleteFile(f.id); refresh() }}>Удалить</button>
          </div>
        </div>
      ))}
    </div>
  )
}

function ПользователиTab(){
  const [users,setПользователи]=useState([])
  const delUser = useStore(s=>s.deleteUser)
  useEffect(()=>{ (async()=>{
    const res = await fetch(useStore.getState().serverUrl+'/api/users', { headers:{ Authorization:'Bearer '+useStore.getState().token }})
    const data = await res.json(); setПользователи(data.users)
  })() },[])
  return (
    <div className="space-y-2">
      {users.map(u=>(
        <div key={u.id} className="panel rounded-2xl px-3 py-2 flex items-center justify-between">
          <div className="text-sm">@{u.username} <span className="text-xs text-white/60">({u.role})</span></div>
          <button className="px-3 py-1 rounded-xl bg-white/10 hover:bg-white/20" onClick={async ()=>{ await delUser(u.id); setПользователи(users.filter(x=>x.id!==u.id)) }}>Удалить</button>
        </div>
      ))}
    </div>
  )
}

