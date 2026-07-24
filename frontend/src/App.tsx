import { useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { BountiesPage } from './pages/BountiesPage'
import { BountyDetailPage } from './pages/BountyDetailPage'
import { CreateBountyPage } from './pages/CreateBountyPage'
import { CreateProjectPage } from './pages/CreateProjectPage'
import { HomePage } from './pages/HomePage'
import { MyTasksPage } from './pages/MyTasksPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProjectDetailPage } from './pages/ProjectDetailPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { ReviewPage } from './pages/ReviewPage'
import { SettlementSuccessPage } from './pages/SettlementSuccessPage'
import { SubmitWorkPage } from './pages/SubmitWorkPage'
import { TravelScenarioPage } from './pages/TravelScenarioPage'
import { useAppStore } from './store/useAppStore'

function App() {
  const hydrate = useAppStore((state) => state.hydrate)
  const isHydrating = useAppStore((state) => state.isHydrating)

  useEffect(() => {
    void hydrate()
    const refresh = () => void hydrate()
    window.addEventListener('dont-ghost-me:chain-updated', refresh)
    return () => window.removeEventListener('dont-ghost-me:chain-updated', refresh)
  }, [hydrate])

  if (isHydrating) {
    return (
      <div className="app-loading">
        <div className="loading-mark">🕊️</div>
        <strong>不要鸽我</strong>
        <span>正在同步模拟链上状态…</span>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/create" element={<CreateProjectPage />} />
          <Route path="/travel" element={<TravelScenarioPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/project/:projectId" element={<ProjectDetailPage />} />
          <Route path="/project/:projectId/create-bounty" element={<CreateBountyPage />} />
          <Route path="/bounties" element={<BountiesPage />} />
          <Route path="/bounty/:bountyId" element={<BountyDetailPage />} />
          <Route path="/bounty/:bountyId/submit" element={<SubmitWorkPage />} />
          <Route path="/my-tasks" element={<MyTasksPage />} />
          <Route path="/project/:projectId/review/:bountyId" element={<ReviewPage />} />
          <Route path="/settlement-success" element={<SettlementSuccessPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
