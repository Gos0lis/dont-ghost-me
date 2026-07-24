import { Outlet } from 'react-router-dom'
import { Navbar } from '../components/Navbar'
import { ToastViewport } from '../components/ui/Toast'

export function AppLayout() {
  return (
    <div className="app-shell">
      <Navbar />
      <main><Outlet /></main>
      <footer className="site-footer">
        <div><strong>不要鸽我</strong><span>把违约变成解决问题的奖励。</span></div>
        <span>Monad Hackathon Demo · 本站所有交易均为模拟</span>
      </footer>
      <ToastViewport />
    </div>
  )
}
