// src/hooks/useAuth.js
import { useEffect, useState } from 'react'
import { verifyGoogle } from '../api'

export default function useAuth(){
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(()=>{
    const saved = localStorage.getItem('fraudsynth_user')
    if (saved) setUser(JSON.parse(saved))
    setReady(true)
  },[])

  async function onCredentialResponse(res, mode='signup'){
    try{
      const data = await verifyGoogle(res.credential, mode)
      setUser(data.user)
      localStorage.setItem('fraudsynth_user', JSON.stringify(data.user))
      return true
    }catch(err){
      alert(err.message || 'Auth failed')  // shows "Please sign up before logging in." when appropriate
      return false
    }
  }

  function logout(){
    setUser(null)
    localStorage.removeItem('fraudsynth_user')
  }

  return { user, ready, onCredentialResponse, logout }
}
