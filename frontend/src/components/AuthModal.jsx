// src/components/AuthModal.jsx
import { useState } from 'react'
import GoogleLoginButton from './GoogleLoginButton'

export default function AuthModal({ open, onClose, onSuccess, defaultTab = 'signup' }) {
  const [tab, setTab] = useState(defaultTab) // 'signup' | 'login'
  if (!open) return null
  const isSignup = tab === 'signup'
  const googleText = isSignup ? 'signup_with' : 'signin_with'

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="modal">
        <div className="seg">
          <button className={`seg-btn ${isSignup ? 'active' : ''}`} onClick={()=>setTab('signup')}>Sign up</button>
          <button className={`seg-btn ${!isSignup ? 'active' : ''}`} onClick={()=>setTab('login')}>Log in</button>
        </div>

        <div style={{display:'flex', justifyContent:'center', marginTop:16}}>
          <GoogleLoginButton
            text={googleText}
            size="large"
            theme="outline"
            width={360}
            onSuccess={(res) => onSuccess(res, isSignup ? 'signup' : 'login')}
          />
        </div>
      </div>
    </>
  )
}
