import { useEffect, useRef } from 'react'
import designBody from './designBody.html?raw'
import { wireDesignToMock } from './wireDesignToMock'
import '../styles/design-v11.css'

/**
 * V11 design shell wired to designBackend → mockContractService.
 * UI mutations persist in localStorage; swap contractService later for on-chain.
 */
export function DesignApp() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let cancelled = false
    let cleanup: (() => void) | undefined

    // Avoid StrictMode double-mount wiping listeners mid-init.
    const timer = window.setTimeout(() => {
      if (cancelled) return
      host.innerHTML = designBody
      cleanup = wireDesignToMock()
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      cleanup?.()
      host.innerHTML = ''
      document.body.classList.remove('modal-open', 'design-busy')
    }
  }, [])

  return <div className="design-app-host" ref={hostRef} />
}
