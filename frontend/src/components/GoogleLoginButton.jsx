// src/components/GoogleLoginButton.jsx
import { useEffect, useRef } from 'react'

export default function GoogleLoginButton({
  onSuccess,
  size = 'large',           // 'small' | 'medium' | 'large'
  text = 'signin_with',     // 'signin_with' | 'signup_with' | 'continue_with'
  theme = 'outline',        // 'outline' | 'filled_blue' | 'filled_black'
  width = 280,
}) {
  const btnRef = useRef(null)

  useEffect(() => {
    // Ensure the Google script is loaded
    if (!window.google || !window.google.accounts || !window.google.accounts.id) {
      console.warn('Google GSI script not loaded. Did you add it to index.html?')
      return
    }

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) {
      console.error('VITE_GOOGLE_CLIENT_ID is missing')
      return
    }

    // Initialize once per mount
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        // Pass the whole response up (contains .credential)
        if (onSuccess) onSuccess(response)
      },
      ux_mode: 'popup',
      // login_uri: not needed because we verify on backend
    })

    // Render the button into our container
    btnRef.current.innerHTML = '' // clear if re-rendering
    window.google.accounts.id.renderButton(btnRef.current, {
      type: 'standard',
      theme,
      size,
      text,
      shape: 'pill',
      width,
      logo_alignment: 'left',
    })

    // (Optional) One-tap can be enabled as well:
    // window.google.accounts.id.prompt()

  }, [onSuccess, size, text, theme, width])

  return <div ref={btnRef} />
}
