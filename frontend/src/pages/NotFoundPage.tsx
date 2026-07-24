import { Link } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { PrimaryButton } from '../components/ui/Buttons'

export function NotFoundPage() {
  return <div className="page-shell"><EmptyState title="页面飞走了" description="这只鸽子没有找到你要访问的页面。" action={<Link to="/"><PrimaryButton>返回首页</PrimaryButton></Link>} /></div>
}
