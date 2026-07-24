import { Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ProjectCard } from '../components/ProjectCard'
import { PageHeader } from '../components/ui/PageHeader'
import { PrimaryButton } from '../components/ui/Buttons'
import { useAppStore } from '../store/useAppStore'

export function ProjectsPage() {
  const projects = useAppStore((state) => state.projects)
  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="我的项目"
        title="共同承诺项目"
        description="跟踪任务、保证金和每一次救场事件。"
        actions={<Link to="/create"><PrimaryButton icon={<Plus size={17} />}>创建承诺</PrimaryButton></Link>}
      />
      <div className="project-grid">{projects.map((project) => <ProjectCard key={project.id} project={project} />)}</div>
    </div>
  )
}
