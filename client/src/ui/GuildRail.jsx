import React from 'react'
import useStore from '../state/store.js'
import { motion } from 'framer-motion'

export default function GuildRail(){
  const workspaces = useStore(s=>s.workspaces)
  return (
    <div className="w-[84px] border-r border-white/10 bg-white/5 backdrop-blur-md h-full flex flex-col items-center py-3 gap-3">
      {workspaces.map((ws,i)=>(
        <motion.div key={ws.id} initial={{opacity:0, y:-8}} animate={{opacity:1, y:0}} transition={{delay:i*0.05}} className="w-14 h-14 rounded-3xl glass hover:scale-[1.02] transition flex items-center justify-center text-white/80 select-none">H</motion.div>
      ))}
    </div>
  )
}
