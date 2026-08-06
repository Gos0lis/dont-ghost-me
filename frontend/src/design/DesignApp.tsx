import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import designBody from './designBody.html?raw'
import { wireDesignToMock } from './wireDesignToMock'
import '../styles/design-v11.css'

/**
 * V11 design shell with real multi-page routes.
 * Shared chrome + modals live in designBody; visible page follows the URL.
 */
export function DesignApp() {
  const hostRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const navigateRef = useRef(navigate)
  const pathRef = useRef(location.pathname)
  navigateRef.current = navigate
  pathRef.current = location.pathname

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let cancelled = false
    let cleanup: (() => void) | undefined

    const timer = window.setTimeout(() => {
      if (cancelled) return
      host.innerHTML = designBody
      cleanup = wireDesignToMock({
        navigate: (path: string) => {
          const [pathname, search = ''] = path.split('?')
          navigateRef.current({
            pathname: pathname || '/',
            search: search ? `?${search}` : '',
          })
        },
        getPath: () => pathRef.current,
      })
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      cleanup?.()
      host.innerHTML = ''
      document.body.classList.remove('modal-open', 'design-busy')
    }
  }, [])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('dont-ghost-me:route-change', { detail: location.pathname }))
  }, [location.pathname])

  return <div className="design-app-host" ref={hostRef} />
}
