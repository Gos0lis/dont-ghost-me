import { ArrowRight, CalendarDays, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Project } from '../contracts/types'
import { StatusBadge } from './ui/StatusBadge'
import { formatDate } from '../utils/format'

export function ProjectCard({ project }: { project: Project }) {
  return (
    <article className="project-card">
      <div className="project-card-head">
        <span className="project-mark">M</span>
        <StatusBadge status={project.status} />
      </div>
      <h3>{project.name}</h3>
      <p>{project.description}</p>
      <div className="project-progress">
        <div><span>整体进度</span><strong>{project.progress}%</strong></div>
        <div className="progress-track"><span style={{ width: `${project.progress}%` }} /></div>
      </div>
      <div className="project-meta">
        <span><UsersRound size={15} />{project.members.length} 名成员</span>
        <span><CalendarDays size={15} />{formatDate(project.deadline)}</span>
      </div>
      <Link className="text-link" to={`/project/${project.id}`}>进入项目 <ArrowRight size={15} /></Link>
    </article>
  )
}
