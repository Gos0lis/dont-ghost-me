import type { CreateBountyInput } from '../contracts/types'
import { DEMO_PROJECT_ID, TRAVEL_PROJECT_ID } from './mockData'

export type DesignSceneKey = 'hackathon' | 'travel' | 'custom'

export interface SceneMemberDraft {
  name: string
  task: string
}

export interface ScenePreset {
  key: DesignSceneKey
  label: string
  name: string
  deadline: string
  deposit: string
  members: SceneMemberDraft[]
  /** Prefill project id when switching the live workspace demo */
  demoProjectId?: string
}

export interface RescueTicketDraft {
  title: string
  category: string
  summary: string
  reward: number
  deadlineLabel: string
  proof: string
  proofSummary: string
  copy: string
  checks: [string, string, string]
  workLink: string
  workNote: string
  skills: string[]
  deliverables: string[]
  acceptanceCriteria: string[]
}

/** Form presets for “创建一份承诺”. */
export const scenePresets: Record<DesignSceneKey, ScenePreset> = {
  hackathon: {
    key: 'hackathon',
    label: '黑客松团队',
    name: 'Monad 黑客松作品开发',
    deadline: '2026-08-09',
    deposit: '100',
    members: [
      { name: 'Caro', task: '产品与前端 Demo' },
      { name: 'Lin', task: '智能合约与测试' },
    ],
    demoProjectId: DEMO_PROJECT_ID,
  },
  travel: {
    key: 'travel',
    label: '朋友旅行',
    name: '周末海边旅行计划',
    deadline: '2026-08-16',
    deposit: '50',
    members: [
      { name: 'Caro', task: '整理行程与酒店信息' },
      { name: 'Mia', task: '确认车票与集合时间' },
    ],
    demoProjectId: TRAVEL_PROJECT_ID,
  },
  custom: {
    key: 'custom',
    label: '我的多人计划',
    name: '',
    deadline: '',
    // Contract rejects depositAmount == 0; keep a positive default for local/mock create.
    deposit: '50',
    members: [
      { name: 'Caro', task: '待分配任务' },
      { name: '新成员', task: '待分配任务' },
    ],
  },
}

/** Rescue tickets spawned after a member quits (design V11). */
export const rescueTicketTemplates: Record<'hackathon' | 'travel', RescueTicketDraft[]> = {
  hackathon: [
    {
      title: '紧急完成智能合约 MVP',
      category: '开发 · 黑客松',
      summary: '提交代码仓库，等待团队验收',
      reward: 80,
      deadlineLabel: '08 月 08 日 · 22:00',
      proof: 'GitHub 仓库与部署说明',
      proofSummary: '代码仓库 · 部署说明 · 运行截图',
      copy: '队友退出后留下了合约开发缺口。领取后，请在截止时间前完成核心逻辑并提交可运行成果。',
      checks: ['完成保证金、退出与救场池逻辑', '补齐悬赏领取、提交与验收状态', '提交代码仓库和简短运行说明'],
      workLink: 'https://github.com/Gos0lis/dont-ghost-me',
      workNote: '已补齐核心合约逻辑与部署说明，请按交付清单验收。',
      skills: ['Solidity', 'Foundry'],
      deliverables: ['GitHub 仓库', '部署说明'],
      acceptanceCriteria: ['核心逻辑可运行', '包含退出与救场池'],
    },
    {
      title: '整理代码交接与部署说明',
      category: '文档 · 黑客松',
      summary: '补充必要文件与运行步骤',
      reward: 20,
      deadlineLabel: '08 月 09 日 · 12:00',
      proof: '交接文档与运行截图',
      proofSummary: '交接文档 · 运行步骤 · 演示截图',
      copy: '退出成员留下的代码缺少交接信息。领取后，请把运行方式、必要文件和部署步骤整理清楚。',
      checks: ['确认现有仓库可以正常运行', '补齐环境配置和部署步骤', '提交交接文档与演示截图'],
      workLink: 'https://github.com/Gos0lis/dont-ghost-me',
      workNote: '已整理运行环境、部署步骤和必要文件，请按交付清单验收。',
      skills: ['技术写作', 'DevOps'],
      deliverables: ['交接文档', '运行截图'],
      acceptanceCriteria: ['可按文档运行', '步骤完整'],
    },
  ],
  travel: [
    {
      title: '寻找可以同行的旅行替补',
      category: '协调 · 朋友旅行',
      summary: '确认日期、预算和费用交接',
      reward: 20,
      deadlineLabel: '08 月 15 日 · 18:00',
      proof: '替补确认记录与费用交接',
      proofSummary: '替补确认 · 群聊记录 · 费用交接',
      copy: '一名朋友临时退出，原来的房间和行程留下空位。请找到合适的替补，并完成信息与费用交接。',
      checks: ['确认替补可以参加完整行程', '说明预算、集合时间和共同规则', '在旅行群完成成员与费用交接'],
      workLink: 'https://example.com/travel-replacement-proof',
      workNote: '替补成员已经确认日期和预算，费用与群聊信息已完成交接。',
      skills: ['协调', '沟通'],
      deliverables: ['替补确认记录', '费用交接'],
      acceptanceCriteria: ['替补确认同行', '费用交接完成'],
    },
    {
      title: '转卖临时空出的活动门票',
      category: '票务 · 朋友旅行',
      summary: '发布转让信息并完成收款',
      reward: 15,
      deadlineLabel: '08 月 16 日 · 12:00',
      proof: '转卖记录与收款凭证',
      proofSummary: '转让页面 · 沟通记录 · 收款凭证',
      copy: '退出成员已经购买活动门票。请发布真实转让信息，找到接手者并把处理结果同步给团队。',
      checks: ['核对票面信息与可转让规则', '完成买家沟通和票务交接', '提交转让记录与收款凭证'],
      workLink: 'https://example.com/ticket-transfer-proof',
      workNote: '活动门票已经完成转让，买家确认收到票务信息，收款记录已附上。',
      skills: ['票务', '沟通'],
      deliverables: ['转卖记录', '收款凭证'],
      acceptanceCriteria: ['门票已转让', '收款到账'],
    },
    {
      title: '修改酒店入住人与行程',
      category: '行程 · 朋友旅行',
      summary: '联系酒店并同步新安排',
      reward: 15,
      deadlineLabel: '08 月 16 日 · 20:00',
      proof: '酒店修改确认与新行程',
      proofSummary: '酒店确认 · 新入住人 · 更新行程',
      copy: '成员变化后，酒店入住人与集合安排需要同步修改。请联系酒店并把新的行程发给所有成员。',
      checks: ['确认酒店允许修改入住信息', '更新入住人、房型与费用分配', '把新行程同步给全部成员'],
      workLink: 'https://example.com/hotel-change-proof',
      workNote: '酒店已确认修改入住人，费用和集合时间也已经同步给全部成员。',
      skills: ['行程规划'],
      deliverables: ['酒店确认', '新行程'],
      acceptanceCriteria: ['酒店已更新', '成员已同步'],
    },
  ],
}

export function ticketDraftToCreateInput(
  projectId: string,
  sourceMemberId: string,
  ticket: RescueTicketDraft,
): CreateBountyInput {
  return {
    projectId,
    title: ticket.title,
    description: ticket.copy,
    skills: ticket.skills,
    deliverables: ticket.deliverables,
    acceptanceCriteria: ticket.acceptanceCriteria,
    deadline: new Date().toISOString(),
    reward: ticket.reward,
    allowMultiple: false,
    sourceMemberId,
  }
}

export interface RescuePackagePreset {
  title: string
  summary: string
  category: string
  subtasks: RescueTicketDraft[]
}

/** One complete rescue package per scene (subtasks are deliverables, not solo claims). */
export const rescuePackagePresets: Record<'hackathon' | 'travel', RescuePackagePreset> = {
  hackathon: {
    title: '黑客松退出后的完整补位任务',
    summary: '一次成员退出留下的开发缺口，需按下列交付项整包完成。',
    category: '开发 · 黑客松',
    subtasks: rescueTicketTemplates.hackathon,
  },
  travel: {
    title: '旅行退出后的完整补位任务',
    summary: '找替补、处理门票与修改酒店，同属一次退出后的完整救场任务。',
    category: '协调 · 朋友旅行',
    subtasks: rescueTicketTemplates.travel,
  },
}

export const workspaceCopy: Record<'hackathon' | 'travel', {
  eyebrow: string
  workspaceDescription: string
  label: string
  rescueEyebrow: string
  rescueDescription: string
}> = {
  hackathon: {
    eyebrow: 'MY PROMISE',
    workspaceDescription: '连接钱包后，这里只显示与你相关的进行中承诺。',
    label: '黑客松项目',
    rescueEyebrow: 'RESCUE BOARD',
    rescueDescription: '成员退出后生成一个完整救场任务，内含多项交付，需整包领取与验收。',
  },
  travel: {
    eyebrow: 'MY PROMISE',
    workspaceDescription: '连接钱包后，这里只显示与你相关的进行中承诺。',
    label: '朋友旅行',
    rescueEyebrow: 'RESCUE BOARD',
    rescueDescription: '一次退出对应一个完整救场任务，拆成三项交付，不可单独领取。',
  },
}
