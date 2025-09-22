import React, { useState } from 'react'
import axios from 'axios'; import useStore from '../state/store.js'

export default function Login(){
  const [mode,setMode]=useState('login'); const [username,setUsername]=useState(''); const [password,setPassword]=useState('')
  const setAuth = useStore(s=>s.setAuth); const server = useStore(s=>s.serverUrl)
  const submit = async (e)=>{
    e.preventDefault()
    const url = mode==='login'? '/api/login':'/api/register'
    const { data } = await axios.post(server+url,{username,password})
    setAuth(data.token, data.user)
  }
  return (
    <div className="h-[calc(100%-48px)] flex items-center justify-center relative">
      <div className="absolute inset-0 pointer-events-none">
        <div className="w-96 h-96 rounded-full blur-3xl opacity-30 bg-indigo-500/40 absolute -top-16 -left-16"></div>
        <div className="w-96 h-96 rounded-full blur-3xl opacity-30 bg-emerald-500/40 absolute bottom-0 right-10"></div>
      </div>
      <div className="glass p-10 rounded-3xl w-[520px] border-white/15 relative">
        <h1 className="text-2xl mb-6 tracking-widest text-white/90">Welcome to Liquid Glass</h1>
        <form onSubmit={submit} className="space-y-4">
          <input value={username} onChange={e=>setUsername(e.target.value)} placeholder="Username" className="w-full bg-white/5 border border-white/15 rounded-2xl px-4 py-3 outline-none focus:bg-white/10"/>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" className="w-full bg-white/5 border border-white/15 rounded-2xl px-4 py-3 outline-none focus:bg-white/10"/>
          <button className="w-full bg-white/20 hover:bg-white/30 rounded-2xl py-3">{mode==='login'?'Sign in':'Create account'}</button>
          <div className="text-sm text-white/70 text-center">
            {mode==='login'?<span>New here? <button type="button" onClick={()=>setMode('register')} className="underline">Create account</button></span>:
            <span>Have an account? <button type="button" onClick={()=>setMode('login')} className="underline">Sign in</button></span>}
          </div>
        </form>
      </div>
    </div>
  )
}
