import { useEffect, useRef } from 'react'
import designBody from './designBody.html?raw'
import { initDesignDemo } from './initDesignDemo.js'
import '../styles/design-v11.css'

/**
 * V11 design shell: mounts the static markup and wires hardcoded demo interactions.
 * Data is intentionally in-DOM / hardcoded; later phases can replace this with React state + contractService.
 */
export function DesignApp() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    host.innerHTML = designBody
    const cleanup = initDesignDemo()

    return () => {
      cleanup()
      host.innerHTML = ''
      document.body.classList.remove('modal-open')
    }
  }, [])

  return <div className="design-app-host" ref={hostRef} />
}
