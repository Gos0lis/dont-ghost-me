import { Bird, Menu, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import { RoleSwitcher } from './RoleSwitcher'
import { WalletButton } from './WalletButton'

const links = [
  { to: '/', label: '首页' },
  { to: '/projects', label: '我的项目' },
  { to: '/bounties', label: '救场悬赏' },
  { to: '/my-tasks', label: '我的任务' },
]

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const resetDemo = useAppStore((state) => state.resetDemo)
  return (
    <header className="navbar-wrap">
      <nav className="navbar">
        <Link className="brand" to="/">
          <span><Bird size={21} /></span>
          <strong>不要鸽我</strong>
        </Link>
        <div className={`nav-links ${menuOpen ? 'nav-open' : ''}`}>
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} onClick={() => setMenuOpen(false)}>{link.label}</NavLink>
          ))}
          <button className="reset-link" onClick={() => void resetDemo()}><RotateCcw size={15} />重置 Demo</button>
        </div>
        <div className="nav-actions">
          <RoleSwitcher />
          <WalletButton />
          <button className="mobile-menu-button" onClick={() => setMenuOpen((value) => !value)} aria-label="打开导航菜单">
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>
    </header>
  )
}
