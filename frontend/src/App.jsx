// import { useState } from 'react'
// import Sidebar from './components/Sidebar'
// import ModelAnalysis from './components/ModelAnalysis'
// import UserInput from './components/UserInput'
// import AuthModal from './components/AuthModal'
// import useAuth from './hooks/useAuth'
// import './styles.css'

// export default function App(){
//   const [tab, setTab] = useState('analysis')
//   const [authOpen, setAuthOpen] = useState(false)
//   const [authDefaultTab, setAuthDefaultTab] = useState('signup') // new
//   const { user, ready, onCredentialResponse, logout } = useAuth()

//   function handleSetTab(next){
//     if (next === 'input' && !user){
//       setAuthDefaultTab('signup') // default to signup on first try
//       setAuthOpen(true)
//       return
//     }
//     setTab(next)
//   }

//   const pageTitle = user
//     ? (user.name || user.email)                     // <-- show user name when logged in
//     : (tab === 'analysis' ? 'Model Analysis' : 'User Input')

//   return (
//     <div className="app">
//       <Sidebar tab={tab} setTab={handleSetTab} />
//       <main className="content">
//         <div className="header">
//           <h2>{pageTitle}</h2>

//           <div>
//             {user ? (
//               <div className="row" style={{alignItems:'center', gap:10}}>
//                 <img src={user.picture} alt="pfp" width="36" height="36" style={{borderRadius:999}} />
//                 <div>{user.name || user.email}</div>
//                 <button className="btn" onClick={logout}>Logout</button>
//               </div>
//             ) : ready ? (
//               <div className="seg" style={{width:'auto'}}>
//                 <button
//                   className="seg-btn"
//                   onClick={() => { setAuthDefaultTab('signup'); setAuthOpen(true); }}
//                 >
//                   Sign up
//                 </button>
//                 <button
//                   className="seg-btn active"
//                   onClick={() => { setAuthDefaultTab('login'); setAuthOpen(true); }}
//                 >
//                   Log in
//                 </button>
//               </div>
//             ) : null}
//           </div>
//         </div>

//         {tab==='analysis'
//           ? <ModelAnalysis/>
//           : <UserInput user={user} onRequireAuth={() => { setAuthDefaultTab('signup'); setAuthOpen(true); }} />}

//         <AuthModal
//         open={authOpen}
//         defaultTab={authDefaultTab}
//         onClose={()=>setAuthOpen(false)}
//         onSuccess={async (res, mode)=>{
//           const ok = await onCredentialResponse(res, mode)  // pass the mode
//           if (ok) {
//             setAuthOpen(false)
//             setTab('input')  // show User Input only after successful auth
//           }
//         }}
//       />

//       </main>
//     </div>
//   )
// }
import { useState } from 'react'
import Sidebar from './components/Sidebar'
import ModelAnalysis from './components/ModelAnalysis'
import UserInput from './components/UserInput'
import './styles.css'

export default function App(){
  const [tab, setTab] = useState('analysis') // start wherever you prefer

  const pageTitle = tab === 'analysis' ? 'Model Analysis' : 'User Input'

  return (
    <div className="app">
      <Sidebar tab={tab} setTab={setTab} />
      <main className="content">
        <div className="header">
          <h2>{pageTitle}</h2>
          <div />
        </div>

        {tab === 'analysis' ? <ModelAnalysis/> : <UserInput />}
      </main>
    </div>
  )
}

