import type { ContractService } from './contractService'
import type {
  Address,
  Bounty,
  CreateBountyInput,
  CreateProjectInput,
  Hash,
  MockChainState,
  TimelineEvent,
  TransactionResponse,
} from '../contracts/types'
import { createInitialChainState, DEMO_BOUNTY_ID } from '../data/mockData'

const STORAGE_KEY = 'dont-ghost-me:mock-chain:v11'

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))
const clone = <T,>(value: T): T => structuredClone(value)
const now = () => new Date().toISOString()
const randomDelay = () => 500 + Math.floor(Math.random() * 701)
const randomHex = (length: number) =>
  Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('')

const makeHash = (): Hash => `0x${randomHex(64)}`

function readState(): MockChainState {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    const initial = createInitialChainState()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial))
    return initial
  }
  try {
    const parsed = JSON.parse(raw) as MockChainState
    if (parsed.version !== 11) throw new Error('outdated mock state')
    return parsed
  } catch {
    const initial = createInitialChainState()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial))
    return initial
  }
}

function writeState(state: MockChainState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  window.dispatchEvent(new CustomEvent('dont-ghost-me:chain-updated'))
}

function timeline(
  type: TimelineEvent['type'],
  title: string,
  description: string,
  txHash?: Hash,
): TimelineEvent {
  return { id: `event-${Date.now()}-${randomHex(4)}`, type, title, description, timestamp: now(), txHash }
}

function currentAccount(state: MockChainState) {
  const account = state.connection.account
  if (!state.connection.isConnected || !account) throw new Error('请先连接钱包')
  return state.accounts.find((item) => item.id === account.id) ?? account
}

function assertProjectOwner(project: { creatorAddress: Address }, account: { address: Address }) {
  if (project.creatorAddress.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error('只有项目发起人可以执行此操作')
  }
}

async function writeTransaction(
  method: string,
  mutate: (state: MockChainState, hash: Hash) => string,
): Promise<TransactionResponse> {
  // TODO: Replace with wagmi writeContract
  const state = readState()
  const hash = makeHash()
  const from = state.connection.account?.address
  state.receipts[hash] = {
    hash,
    status: 'pending',
    timestamp: now(),
    method,
    from,
    message: '交易已提交，等待确认',
  }
  writeState(state)
  await wait(randomDelay())

  const latest = readState()
  try {
    const message = mutate(latest, hash)
    latest.blockNumber += 1
    latest.receipts[hash] = {
      hash,
      status: 'success',
      blockNumber: latest.blockNumber,
      timestamp: now(),
      method,
      from,
      message,
    }
    writeState(latest)
  } catch (error) {
    latest.receipts[hash] = {
      hash,
      status: 'failed',
      blockNumber: latest.blockNumber,
      timestamp: now(),
      method,
      from,
      message: '交易执行失败',
      error: error instanceof Error ? error.message : '未知错误',
    }
    writeState(latest)
  }
  return { hash, status: 'pending' }
}

export const mockContractService: ContractService = {
  async connectWallet(connector = 'MetaMask', accountId = 'caro') {
    const state = readState()
    const account = state.accounts.find((item) => item.id === accountId) ?? state.accounts[0]
    state.connection = { isConnected: true, connector, account: clone(account) }
    writeState(state)
    await wait(350)
    return clone(state.connection)
  },

  async disconnectWallet() {
    const state = readState()
    state.connection = { isConnected: false }
    writeState(state)
  },

  async switchAccount(accountId) {
    const state = readState()
    const account = state.accounts.find((item) => item.id === accountId)
    if (!account) throw new Error('演示账户不存在')
    state.connection = {
      isConnected: true,
      connector: state.connection.connector ?? 'MetaMask',
      account: clone(account),
    }
    writeState(state)
    return clone(state.connection)
  },

  async getWalletConnection() {
    return clone(readState().connection)
  },

  async getAccounts() {
    return clone(readState().accounts)
  },

  async createProject(input: CreateProjectInput) {
    return writeTransaction('createProject', (state, hash) => {
      const account = currentAccount(state)
      const id = `project-${Date.now()}`
      const members = input.members.map((member, index) => ({
        ...member,
        id: `member-${index}-${Date.now()}`,
        // Design flow: create first, then confirm + lock per member.
        depositLocked: false,
        status: 'invited' as const,
      }))
      const totalDeposit = members.reduce((sum, member) => sum + member.deposit, 0)
      state.projects.unshift({
        id,
        ...input,
        creatorAddress: account.address,
        status: 'awaiting_confirmation',
        progress: 0,
        totalDeposit,
        lockedDeposit: 0,
        rescuePool: 0,
        reservedBounty: 0,
        members,
        timeline: [
          timeline(
            'project',
            '共同承诺已寄出',
            `${members.length} 名成员待确认，合计计划锁定 ${totalDeposit} MON`,
            hash,
          ),
        ],
      })
      return `共同承诺已创建，等待成员确认并锁定保证金`
    })
  },

  async confirmParticipation(projectId, memberId) {
    return writeTransaction('confirmParticipation', (state, hash) => {
      const project = state.projects.find((item) => item.id === projectId)
      const member = project?.members.find((item) => item.id === memberId)
      if (!project || !member) throw new Error('成员或项目不存在')
      member.status = 'confirmed'
      project.timeline.push(timeline('member', `${member.name} 已确认参与`, '成员已确认任务与承诺规则', hash))
      return '参与确认成功'
    })
  },

  async lockDeposit(projectId, memberId) {
    return writeTransaction('lockDeposit', (state, hash) => {
      const project = state.projects.find((item) => item.id === projectId)
      const member = project?.members.find((item) => item.id === memberId)
      if (!project || !member) throw new Error('成员或项目不存在')
      if (member.depositLocked) throw new Error('保证金已经锁定')
      // Demo initiator can lock on behalf of invited members (design confirm flow).
      const payer = state.accounts.find((item) => item.id === 'caro') ?? currentAccount(state)
      if (payer.balance < member.deposit) throw new Error('MON 余额不足')
      payer.balance -= member.deposit
      if (state.connection.account?.id === payer.id) {
        state.connection.account.balance = payer.balance
      }
      member.depositLocked = true
      member.status = 'active'
      project.lockedDeposit += member.deposit
      project.timeline.push(timeline('member', `${member.name} 锁定保证金`, `已锁定 ${member.deposit} MON`, hash))
      const allLocked = project.members.every((item) => item.depositLocked)
      if (allLocked && project.status === 'awaiting_confirmation') {
        project.status = 'active'
        project.progress = Math.max(project.progress, 5)
        project.timeline.push(
          timeline('member', '全员确认完成', `共锁定 ${project.lockedDeposit} MON，承诺正式生效`, hash),
        )
      }
      return `成功锁定 ${member.deposit} MON`
    })
  },

  async quitProject(projectId, memberId) {
    return writeTransaction('quitProject', (state, hash) => {
      const account = currentAccount(state)
      const project = state.projects.find((item) => item.id === projectId)
      const member = project?.members.find((item) => item.id === memberId)
      if (!project || !member) throw new Error('成员或项目不存在')
      if (!['active', 'active_again'].includes(project.status)) throw new Error('当前项目状态不可退出')
      if (account.role !== 'initiator' && account.id !== member.id) throw new Error('只有成员本人或项目发起人可以确认退出')
      if (member.status === 'quit') throw new Error('该成员已经退出')
      const unfinishedTask = member.task
      member.status = 'quit'
      member.depositLocked = false
      member.task = `无人负责：${unfinishedTask}`
      project.lockedDeposit -= member.deposit
      project.rescuePool += member.deposit
      project.status = 'rescue_needed'
      project.progress = 48
      project.timeline.push(
        timeline(
          'warning',
          `${member.name} 中途退出`,
          `${member.deposit} MON 保证金已进入救场悬赏池，遗留任务等待补救`,
          hash,
        ),
      )
      return `${member.name} 已退出，${member.deposit} MON 已进入救场池`
    })
  },

  async advanceProject(projectId) {
    return writeTransaction('advanceProject', (state, hash) => {
      const account = currentAccount(state)
      if (account.role !== 'initiator') throw new Error('只有项目发起人可以确认里程碑')
      const project = state.projects.find((item) => item.id === projectId)
      if (!project) throw new Error('项目不存在')
      if (!['active', 'active_again'].includes(project.status)) throw new Error('当前项目状态不可推进')
      if (project.progress >= 90) throw new Error('所有里程碑均已确认，请完成项目结算')
      project.progress = project.status === 'active_again' ? 90 : Math.max(80, project.progress + 20)
      project.timeline.push(
        timeline('submission', '项目里程碑已确认', `当前整体进度更新为 ${project.progress}%`, hash),
      )
      return `里程碑确认成功，项目进度更新为 ${project.progress}%`
    })
  },

  async completeProject(projectId) {
    return writeTransaction('completeProject', (state, hash) => {
      const account = currentAccount(state)
      if (account.role !== 'initiator') throw new Error('只有项目发起人可以完成项目结算')
      const project = state.projects.find((item) => item.id === projectId)
      if (!project) throw new Error('项目不存在')
      assertProjectOwner(project, account)
      if (!['active', 'active_again'].includes(project.status)) throw new Error('当前项目状态不可结算')
      if (project.reservedBounty > 0) throw new Error('仍有未结算的救场悬赏')

      let refunded = 0
      project.members.forEach((member) => {
        if (member.status === 'quit' || !member.depositLocked) return
        const wallet = state.accounts.find(
          (item) => item.address.toLowerCase() === member.address.toLowerCase(),
        )
        if (wallet) {
          wallet.balance += member.deposit
          if (state.connection.account?.id === wallet.id) {
            state.connection.account.balance = wallet.balance
          }
        }
        refunded += member.deposit
        member.status = 'completed'
        member.depositLocked = false
      })

      const remainingRescuePool = project.rescuePool
      // Unspent rescue pool returns to the project owner in mock (aligned with owner sweep path).
      if (remainingRescuePool > 0) {
        const owner = state.accounts.find(
          (item) => item.address.toLowerCase() === project.creatorAddress.toLowerCase(),
        )
        if (owner) {
          owner.balance += remainingRescuePool
          if (state.connection.account?.id === owner.id) {
            state.connection.account.balance = owner.balance
          }
        }
      }

      project.lockedDeposit = 0
      project.rescuePool = 0
      project.progress = 100
      project.status = 'completed'
      project.timeline.push(
        timeline(
          'payment',
          '项目完成并结算',
          `项目交付完成，已向各成员退回 ${refunded} MON 保证金${remainingRescuePool ? `，剩余救场池 ${remainingRescuePool} MON 退回发起人` : ''}`,
          hash,
        ),
      )
      return `项目已完成，已退回 ${refunded + remainingRescuePool} MON`
    })
  },

  async batchResolveBounties(projectId) {
    return writeTransaction('batchResolveBounties', (state, hash) => {
      const account = currentAccount(state)
      if (account.role !== 'initiator') throw new Error('只有项目发起人可以发起批量结算')
      const project = state.projects.find((item) => item.id === projectId)
      if (!project) throw new Error('项目不存在')
      assertProjectOwner(project, account)
      const pendingBounties = state.bounties.filter(
        (bounty) => bounty.projectId === projectId && bounty.status === 'submitted',
      )
      if (pendingBounties.length === 0) throw new Error('没有待完成的救场悬赏')
      const totalReward = pendingBounties.reduce((sum, bounty) => sum + bounty.reward, 0)
      if (totalReward > project.rescuePool) throw new Error('救场池余额不足')
      pendingBounties.forEach((bounty) => {
        bounty.status = 'paid'
        bounty.rescuerId = 'travel-helper-team'
        bounty.rescuerName = '旅行救场小队'
        bounty.rescuerAddress = '0x7A8E10B25C394FD2'
        bounty.paidTxHash = hash
      })
      project.rescuePool -= totalReward
      project.reservedBounty = Math.max(0, project.reservedBounty - totalReward)
      project.status = 'active_again'
      project.progress = 90
      const rescuedMember = project.members.find((member) => member.status === 'quit')
      if (rescuedMember) rescuedMember.task = '已由旅行救场小队完成三项补救任务'
      project.timeline.push(
        timeline(
          'payment',
          `${pendingBounties.length} 项补救任务批量验收`,
          `${totalReward} MON 已支付给旅行救场小队，行程恢复进行`,
          hash,
        ),
      )
      return `${pendingBounties.length} 项补救已完成，${totalReward} MON 奖励支付成功`
    })
  },

  async createBounty(input: CreateBountyInput) {
    return writeTransaction('createBounty', (state, hash) => {
      const account = currentAccount(state)
      const project = state.projects.find((item) => item.id === input.projectId)
      if (!project) throw new Error('项目不存在')
      assertProjectOwner(project, account)
      if (!['active', 'active_again', 'rescue_needed', 'rescue_in_progress'].includes(project.status)) {
        throw new Error('当前项目状态不可发布悬赏')
      }
      if (!(input.reward > 0)) throw new Error('悬赏奖励必须大于 0')
      if (project.rescuePool - project.reservedBounty < input.reward) throw new Error('救场池可用余额不足')
      const existing = state.bounties.find((item) => item.id === DEMO_BOUNTY_ID)
      const sourceMember = project.members.find((item) => item.id === input.sourceMemberId)
      const bounty: Bounty = {
        id: existing ? `bounty-${Date.now()}` : DEMO_BOUNTY_ID,
        ...input,
        publisherName: account.name,
        publisherAddress: account.address,
        sourceNote: `奖励来自 ${sourceMember?.name ?? '退出成员'} 的违约保证金`,
        status: 'open',
      }
      state.bounties.unshift(bounty)
      project.reservedBounty += input.reward
      project.timeline.push(
        timeline('bounty', '救场悬赏已发布', `“${input.title}”公开发布，奖励 ${input.reward} MON`, hash),
      )
      return `悬赏发布成功，已预留 ${input.reward} MON`
    })
  },

  async claimBounty(bountyId) {
    return writeTransaction('claimBounty', (state, hash) => {
      // Prefer rescuer account; designBackend switches to builder-07 before calling.
      let account = currentAccount(state)
      if (account.role !== 'rescuer') {
        const rescuer = state.accounts.find((item) => item.role === 'rescuer')
        if (!rescuer) throw new Error('请切换到外部救场者账户')
        account = rescuer
        state.connection = {
          isConnected: true,
          connector: state.connection.connector ?? 'MetaMask',
          account: clone(rescuer),
        }
      }
      const bounty = state.bounties.find((item) => item.id === bountyId)
      const project = state.projects.find((item) => item.id === bounty?.projectId)
      if (!bounty || !project) throw new Error('悬赏不存在')
      if (bounty.status !== 'open') throw new Error('该悬赏当前不可领取')
      bounty.status = 'claimed'
      bounty.rescuerId = account.id
      bounty.rescuerName = account.name
      bounty.rescuerAddress = account.address
      project.status = 'rescue_in_progress'
      project.timeline.push(
        timeline('bounty', `${account.name} 领取救场任务`, `悬赏“${bounty.title}”进入执行阶段`, hash),
      )
      return '救场任务领取成功'
    })
  },

  async cancelBountyClaim(bountyId) {
    return writeTransaction('cancelBountyClaim', (state, hash) => {
      const account = currentAccount(state)
      const bounty = state.bounties.find((item) => item.id === bountyId)
      const project = state.projects.find((item) => item.id === bounty?.projectId)
      if (!bounty || !project) throw new Error('悬赏不存在')
      if (bounty.rescuerId !== account.id) throw new Error('只有当前领取者可以放弃任务')
      if (!['claimed', 'revision_required'].includes(bounty.status)) throw new Error('当前状态不能放弃任务')
      const rescuerName = bounty.rescuerName ?? account.name
      bounty.status = 'open'
      delete bounty.rescuerId
      delete bounty.rescuerName
      delete bounty.rescuerAddress
      delete bounty.submission
      delete bounty.revisionFeedback
      project.status = 'rescue_needed'
      project.timeline.push(
        timeline(
          'warning',
          `${rescuerName} 放弃救场任务`,
          `悬赏“${bounty.title}”已重新开放，等待新的救场者领取`,
          hash,
        ),
      )
      return '已放弃救场任务，悬赏重新开放领取'
    })
  },

  async submitWork(bountyId, submission) {
    return writeTransaction('submitWork', (state, hash) => {
      const account = currentAccount(state)
      const bounty = state.bounties.find((item) => item.id === bountyId)
      const project = state.projects.find((item) => item.id === bounty?.projectId)
      if (!bounty || !project) throw new Error('悬赏不存在')
      if (bounty.rescuerId !== account.id) throw new Error('只有领取者可以提交成果')
      if (!['claimed', 'revision_required'].includes(bounty.status)) throw new Error('当前状态不可提交')
      bounty.submission = { ...submission, submittedAt: now() }
      bounty.status = 'submitted'
      project.timeline.push(
        timeline('submission', `${account.name} 已提交成果`, '成果已上链记录，等待原团队验收', hash),
      )
      return '成果提交成功，等待验收'
    })
  },

  async requestRevision(bountyId, feedback) {
    return writeTransaction('requestRevision', (state, hash) => {
      const initiator = state.accounts.find((item) => item.role === 'initiator') ?? state.accounts[0]
      if (initiator) {
        state.connection = {
          isConnected: true,
          connector: state.connection.connector ?? 'MetaMask',
          account: clone(initiator),
        }
      }
      currentAccount(state)
      const bounty = state.bounties.find((item) => item.id === bountyId)
      const project = state.projects.find((item) => item.id === bounty?.projectId)
      if (!bounty || !project) throw new Error('悬赏不存在')
      if (bounty.status !== 'submitted') throw new Error('成果尚未进入等待验收状态')
      bounty.status = 'revision_required'
      bounty.revisionFeedback = feedback
      project.timeline.push(timeline('submission', '团队要求修改成果', feedback, hash))
      return '修改意见已提交'
    })
  },

  async approveAndPay(bountyId) {
    return writeTransaction('approveAndPay', (state, hash) => {
      const initiator = state.accounts.find((item) => item.role === 'initiator') ?? state.accounts[0]
      if (initiator) {
        state.connection = {
          isConnected: true,
          connector: state.connection.connector ?? 'MetaMask',
          account: clone(initiator),
        }
      }
      const account = currentAccount(state)
      if (account.role !== 'initiator') throw new Error('只有项目发起人可以验收付款')
      const bounty = state.bounties.find((item) => item.id === bountyId)
      const project = state.projects.find((item) => item.id === bounty?.projectId)
      if (!bounty || !project || !bounty.rescuerId) throw new Error('悬赏或救场者不存在')
      assertProjectOwner(project, account)
      if (bounty.status !== 'submitted') throw new Error('成果尚未进入等待验收状态')
      if (project.rescuePool < bounty.reward || project.reservedBounty < bounty.reward) {
        throw new Error('救场池结算余额不足')
      }
      const rescuer = state.accounts.find((item) => item.id === bounty.rescuerId)
      if (!rescuer) throw new Error('救场者账户不存在')
      bounty.status = 'paid'
      bounty.paidTxHash = hash
      rescuer.balance += bounty.reward
      project.rescuePool -= bounty.reward
      project.reservedBounty -= bounty.reward
      project.status = 'active_again'
      project.progress = 76
      const rescuedMember = project.members.find((item) => item.id === bounty.sourceMemberId)
      if (rescuedMember) rescuedMember.task = `已由 ${rescuer.name} 完成：${bounty.title}`
      project.timeline.push(
        timeline(
          'payment',
          `验收通过，${bounty.reward} MON 已支付`,
          `奖励已支付给 ${rescuer.name}，项目恢复进行`,
          hash,
        ),
      )
      if (state.connection.account?.id === rescuer.id) state.connection.account.balance = rescuer.balance
      return `验收通过，${bounty.reward} MON 已支付给 ${rescuer.name}`
    })
  },

  async getProject(projectId) {
    // TODO: Replace with viem readContract
    return clone(readState().projects.find((item) => item.id === projectId))
  },

  async getProjects() {
    // TODO: Replace with viem readContract
    return clone(readState().projects)
  },

  async getBounty(bountyId) {
    // TODO: Replace with viem readContract
    return clone(readState().bounties.find((item) => item.id === bountyId))
  },

  async getBounties() {
    // TODO: Replace with viem readContract
    return clone(readState().bounties)
  },

  async getWalletBalance(address?: Address) {
    // TODO: Replace with viem readContract
    const state = readState()
    const target = address ?? state.connection.account?.address
    return state.accounts.find((item) => item.address === target)?.balance ?? 0
  },

  async getTransactionReceipt(hash) {
    // TODO: Replace mock receipt with publicClient.waitForTransactionReceipt
    const receipt = readState().receipts[hash]
    if (!receipt) throw new Error('找不到交易回执')
    return clone(receipt)
  },

  async resetDemo() {
    localStorage.removeItem(STORAGE_KEY)
    writeState(createInitialChainState())
    await wait(150)
  },
}
