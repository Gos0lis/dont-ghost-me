import type { AccountRole, BountyStatus, MemberStatus, ProjectStatus } from '../contracts/types'

export const shortenAddress = (address?: string) =>
  address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ''

export const formatDate = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  )

export const projectStatusLabel: Record<ProjectStatus, string> = {
  draft: '草稿',
  awaiting_confirmation: '等待确认',
  active: '正常进行',
  rescue_needed: '等待救场',
  rescue_in_progress: '救场进行中',
  active_again: '已恢复进行',
  completed: '已完成',
}

export const memberStatusLabel: Record<MemberStatus, string> = {
  invited: '待确认',
  confirmed: '已确认',
  active: '进行中',
  quit: '已退出',
  completed: '已完成',
}

export const bountyStatusLabel: Record<BountyStatus, string> = {
  open: '等待领取',
  claimed: '进行中',
  submitted: '等待验收',
  revision_required: '需要修改',
  approved: '验收通过',
  paid: '奖励已支付',
}

export const roleLabel: Record<AccountRole, string> = {
  initiator: '项目发起人',
  member: '团队成员',
  rescuer: '外部救场者',
}
