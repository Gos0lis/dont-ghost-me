import type {
  Bounty,
  CreateProjectInput,
  Project,
  ProjectMember,
  TransactionReceipt,
  WalletConnection,
  WorkSubmission,
} from '../contracts/types'
import { LOCAL_DEMO_MEMBER_LIMIT, getChainMode } from '../contracts/chainConfig'
import {
  type DesignSceneKey,
  type RescueTicketDraft,
  rescuePackagePresets,
  scenePresets,
  ticketDraftToCreateInput,
} from '../data/scenePresets'
import { demoAccounts, GOVERNANCE_DEMO_PROJECT_ID } from '../data/mockData'
import { contractService, isOnChainBackend } from './contractService'

export interface DesignSnapshot {
  wallet: WalletConnection
  projects: Project[]
  bounties: Bounty[]
  activeProjectId: string
  activeScene: 'hackathon' | 'travel'
  rescuePackages: RescuePackageMeta[]
  governance?: GovernanceSnapshot
}

export interface GovernanceSnapshot {
  proposalId: string
  projectId: string
  targetId: string
  targetName: string
  targetAddress: `0x${string}`
  proposerAddress: `0x${string}`
  reason: string
  approveVotes: number
  rejectVotes: number
  eligibleMembers: number
  deadline: number
  bondAmount: number
  executed: boolean
  hasCurrentWalletVoted: boolean
}

export interface CreatePromisePayload {
  scene: DesignSceneKey
  name: string
  deadline: string
  deposit: number
  members: Array<{ name: string; task: string }>
  customSceneLabel?: string
}

export interface RescuePackageMeta {
  id: string
  projectId: string
  scene: 'hackathon' | 'travel'
  title: string
  summary: string
  category: string
  bountyIds: string[]
  sourceMemberId: string
  createdAt: string
}

const META_KEY = 'dont-ghost-me:design-meta:v2'

interface DesignMeta {
  activeScene: 'hackathon' | 'travel'
  activeProjectId: string
  /** Stable scene → projectId for local mode (avoids name regex). */
  sceneProjectIds: Partial<Record<'hackathon' | 'travel', string>>
  /** Extra display fields keyed by bounty id */
  ticketMeta: Record<string, Partial<RescueTicketDraft>>
  /** Whole rescue packages (parent task + subtask bounty ids) */
  rescuePackages: RescuePackageMeta[]
}

function readMeta(): DesignMeta {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DesignMeta>
      return {
        activeScene: parsed.activeScene ?? 'hackathon',
        activeProjectId: parsed.activeProjectId ?? '',
        sceneProjectIds: parsed.sceneProjectIds ?? {},
        ticketMeta: parsed.ticketMeta ?? {},
        rescuePackages: parsed.rescuePackages ?? [],
      }
    }
  } catch {
    /* ignore */
  }
  return {
    activeScene: 'hackathon',
    activeProjectId: '',
    sceneProjectIds: {},
    ticketMeta: {},
    rescuePackages: [],
  }
}

function writeMeta(meta: DesignMeta) {
  localStorage.setItem(META_KEY, JSON.stringify(meta))
}

async function waitReceipt(hash: `0x${string}`): Promise<TransactionReceipt> {
  const receipt = await contractService.getTransactionReceipt(hash)
  if (receipt.status === 'failed') throw new Error(receipt.error ?? receipt.message)
  return receipt
}

async function runTx(action: () => Promise<{ hash: `0x${string}` }>) {
  const tx = await action()
  return waitReceipt(tx.hash)
}

async function ensureWallet(accountId = 'caro') {
  const connection = await contractService.getWalletConnection()
  if (getChainMode() === 'chain') {
    if (connection.isConnected && connection.account) return connection
    throw new Error('请先连接钱包')
  }
  if (connection.isConnected && connection.account?.id === accountId) return connection
  return contractService.connectWallet('MetaMask', accountId)
}

function fakeAddress(seed: string): `0x${string}` {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return `0x${hash.toString(16).padStart(17, '0').slice(0, 17)}`
}

function resolveMemberAddress(name: string): `0x${string}` {
  const known = demoAccounts.find((account) => account.name.toLowerCase() === name.trim().toLowerCase())
  return (known?.address as `0x${string}` | undefined) ?? fakeAddress(name)
}

function addressesMatch(a?: string, b?: string) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase())
}

export function projectBelongsToWallet(project: Project, wallet: WalletConnection): boolean {
  if (!wallet.isConnected || !wallet.account) return false
  const { address, id, name } = wallet.account
  if (addressesMatch(project.creatorAddress, address)) return true
  return project.members.some(
    (member) =>
      addressesMatch(member.address, address) ||
      member.id === id ||
      member.name.trim().toLowerCase() === name.trim().toLowerCase(),
  )
}

export function sceneFromProject(project: Project): 'hackathon' | 'travel' {
  return /旅行|travel/i.test(`${project.category} ${project.name}`) ? 'travel' : 'hackathon'
}

function packageStatus(bounties: Bounty[]): Bounty['status'] {
  if (bounties.length === 0) return 'open'
  const allTerminal = bounties.every((item) =>
    ['paid', 'approved', 'rejected', 'cancelled'].includes(item.status),
  )
  if (allTerminal) {
    if (bounties.some((item) => item.status === 'rejected')) return 'rejected'
    if (bounties.some((item) => item.status === 'cancelled')) return 'cancelled'
    return 'paid'
  }
  if (bounties.some((item) => item.status === 'submitted')) return 'submitted'
  if (bounties.some((item) => item.status === 'revision_required')) return 'revision_required'
  if (bounties.some((item) => item.status === 'claimed')) return 'claimed'
  if (bounties.every((item) => item.status === 'open')) return 'open'
  return bounties[0]?.status ?? 'open'
}

/** Fit preset subtask rewards into the available rescue pool (last item takes remainder). */
function scaleRescueSubtasks(templates: RescueTicketDraft[], availablePool: number): RescueTicketDraft[] {
  if (templates.length === 0) return []
  if (!(availablePool > 0)) throw new Error('救场池为空，无法出票')

  const ticketTotal = templates.reduce((sum, ticket) => sum + ticket.reward, 0)
  if (ticketTotal > 0 && ticketTotal <= availablePool) {
    return templates.map((ticket) => ({ ...ticket }))
  }

  if (templates.length === 1) {
    return [{ ...templates[0], reward: availablePool }]
  }

  let allocated = 0
  return templates.map((ticket, index) => {
    if (index === templates.length - 1) {
      const reward = Math.max(1, availablePool - allocated)
      return { ...ticket, reward }
    }
    const share =
      ticketTotal > 0
        ? Math.floor((ticket.reward / ticketTotal) * availablePool)
        : Math.floor(availablePool / templates.length)
    const reward = Math.max(1, share)
    allocated += reward
    if (allocated >= availablePool) {
      allocated -= reward
      const capped = Math.max(1, availablePool - allocated - (templates.length - 1 - index))
      allocated += capped
      return { ...ticket, reward: capped }
    }
    return { ...ticket, reward }
  })
}

/** Publish a rescue package for a member whose deposit is already in the rescue pool. */
async function spawnRescuePackage(
  projectId: string,
  memberId: string,
  scene: 'hackathon' | 'travel',
) {
  // Bounties are owner-only. Mock/local demos switch back to the owner account here.
  await ensureWallet('caro')

  const packagePreset = rescuePackagePresets[scene]
  const project = await contractService.getProject(projectId)
  if (!project) throw new Error('无法读取待出票项目')

  const sourceMember = project.members.find((member) => member.id === memberId)
  if (!sourceMember || sourceMember.status !== 'quit') {
    throw new Error('只能为已经退出或被移除的成员整理救场任务')
  }

  const availablePool = project.rescuePool - project.reservedBounty
  if (!(availablePool > 0)) throw new Error('救场池为空，无法出票')

  const templates = scaleRescueSubtasks(packagePreset.subtasks, availablePool)
  const meta = readMeta()
  const bountyIds: string[] = []
  const packageId = `rescue-pkg-${Date.now()}`
  const persistRescuePackage = () => {
    if (bountyIds.length === 0) return
    const pkg: RescuePackageMeta = {
      id: packageId,
      projectId,
      scene,
      title: packagePreset.title,
      summary: packagePreset.summary,
      category: packagePreset.category,
      bountyIds: [...bountyIds],
      sourceMemberId: memberId,
      createdAt: new Date().toISOString(),
    }
    const existingIndex = meta.rescuePackages.findIndex((item) => item.id === packageId)
    if (existingIndex >= 0) meta.rescuePackages[existingIndex] = pkg
    else meta.rescuePackages.unshift(pkg)
    writeMeta(meta)
  }

  let completed = 0
  try {
    for (const ticket of templates) {
      await runTx(() =>
        contractService.createBounty(ticketDraftToCreateInput(projectId, memberId, ticket)),
      )
      completed += 1
      const allBounties = await contractService.getBounties()
      const created =
        allBounties.find(
          (bounty) =>
            bounty.projectId === projectId &&
            bounty.title === ticket.title &&
            bounty.status === 'open' &&
            !bountyIds.includes(bounty.id),
        ) ?? allBounties.find((bounty) => !bountyIds.includes(bounty.id) && bounty.projectId === projectId)
      if (created) {
        meta.ticketMeta[created.id] = ticket
        bountyIds.push(created.id)
        // Persist after every independent transaction so partial publication stays reachable.
        persistRescuePackage()
      }
    }
  } catch (error) {
    persistRescuePackage()
    const detail = error instanceof Error ? error.message : '未知错误'
    throw new Error(
      `出票中断：已完成 ${completed}/${templates.length} 笔，失败在第 ${completed + 1} 笔。${detail}`,
    )
  }

  persistRescuePackage()
  meta.activeScene = scene
  meta.activeProjectId = projectId
  meta.sceneProjectIds[scene] = projectId
  writeMeta(meta)
}

function pickActiveProjectId(
  walletProjects: Project[],
  preferredId: string,
): string {
  const living = walletProjects.filter(
    (project) => project.status !== 'completed' && project.status !== 'cancelled',
  )
  if (preferredId && living.some((project) => project.id === preferredId)) return preferredId
  if (living[0]?.id) return living[0].id
  // Fall back to preferred / any only when nothing is still in progress.
  if (preferredId && walletProjects.some((project) => project.id === preferredId)) return preferredId
  return walletProjects[0]?.id ?? ''
}

/**
 * Design-facing application layer over contractService.
 * Works with mock OR viem (local Anvil / future Monad) — swap happens in contractService.ts.
 */
export const designBackend = {
  async hydrate(): Promise<DesignSnapshot> {
    const meta = readMeta()
    const [wallet, projects, bounties] = await Promise.all([
      contractService.getWalletConnection(),
      contractService.getProjects(),
      contractService.getBounties(),
    ])

    // Connected wallets only see owned / joined projects — except the pending invite /
    // active meta project, which invitees must open before their address is on-chain.
    let walletProjects = wallet.isConnected
      ? projects.filter((project) => projectBelongsToWallet(project, wallet))
      : []
    if (meta.activeProjectId) {
      const preferred = projects.find((project) => project.id === meta.activeProjectId)
      if (preferred && !walletProjects.some((project) => project.id === preferred.id)) {
        walletProjects = [preferred, ...walletProjects]
      }
    }

    const activeProjectId = pickActiveProjectId(walletProjects, meta.activeProjectId)
    const activeProject = walletProjects.find((project) => project.id === activeProjectId)
    const activeScene = activeProject ? sceneFromProject(activeProject) : meta.activeScene

    let governance: GovernanceSnapshot | undefined
    if (
      isOnChainBackend &&
      activeProject &&
      contractService.getActiveExpulsionProposal &&
      contractService.hasVotedExpulsion
    ) {
      const activeMembers = activeProject.members.filter(
        (member) => member.status === 'active' && member.depositLocked,
      )
      const proposals = await Promise.all(
        activeProject.members.map(async (member) => {
          try {
            const proposal = await contractService.getActiveExpulsionProposal!(
              activeProject.id,
              member.address,
            )
            return proposal ? { proposal, member } : undefined
          } catch {
            // Old deployments do not expose governance getters. The rest of the app
            // should remain usable until the upgraded contract is redeployed.
            return undefined
          }
        }),
      )
      const active = proposals.find(Boolean)
      if (active) {
        const hasCurrentWalletVoted = wallet.account
          ? await contractService
              .hasVotedExpulsion(active.proposal.id, wallet.account.address)
              .catch(() => false)
          : false
        governance = {
          proposalId: active.proposal.id,
          projectId: active.proposal.projectId,
          targetId: active.member.id,
          targetName: active.member.name,
          targetAddress: active.proposal.target,
          proposerAddress: active.proposal.proposer,
          reason: active.proposal.reason,
          approveVotes: active.proposal.approveVotes,
          rejectVotes: active.proposal.rejectVotes,
          eligibleMembers: activeMembers.length,
          deadline: active.proposal.deadline,
          bondAmount: active.proposal.bondAmount,
          executed: active.proposal.executed,
          hasCurrentWalletVoted,
        }
      }
    }

    // Drop packages whose on-chain bounties are gone (e.g. Anvil restarted but localStorage remained).
    const bountyIdSet = new Set(bounties.map((bounty) => bounty.id))
    const livePackages = meta.rescuePackages.filter((pkg) =>
      pkg.bountyIds.some((id) => bountyIdSet.has(id)),
    )
    let metaDirty = false
    if (livePackages.length !== meta.rescuePackages.length) {
      const liveTicketIds = new Set(livePackages.flatMap((pkg) => pkg.bountyIds))
      meta.rescuePackages = livePackages
      meta.ticketMeta = Object.fromEntries(
        Object.entries(meta.ticketMeta).filter(([id]) => liveTicketIds.has(id) || bountyIdSet.has(id)),
      )
      metaDirty = true
    }
    if (activeProjectId !== meta.activeProjectId || activeScene !== meta.activeScene) {
      meta.activeProjectId = activeProjectId
      meta.activeScene = activeScene
      metaDirty = true
    }
    if (metaDirty) writeMeta(meta)

    return {
      wallet,
      projects: walletProjects,
      bounties,
      activeProjectId,
      activeScene,
      // Keep all live packages so rescue hall can browse open tasks even before connect.
      // Wallet-scoped views filter again in listRescuePackages / profile render.
      rescuePackages: livePackages,
      governance,
    }
  },

  getTicketMeta(bountyId: string) {
    return readMeta().ticketMeta[bountyId]
  },

  getRescuePackage(packageId: string) {
    return readMeta().rescuePackages.find((pkg) => pkg.id === packageId)
  },

  listRescuePackagesForProject(snapshot: DesignSnapshot, projectId?: string) {
    const id = projectId ?? snapshot.activeProjectId
    return snapshot.rescuePackages.filter((pkg) => pkg.projectId === id)
  },

  getPackageBounties(snapshot: DesignSnapshot, packageId: string): Bounty[] {
    const pkg = snapshot.rescuePackages.find((item) => item.id === packageId)
    if (!pkg) return []
    return pkg.bountyIds
      .map((bountyId) => snapshot.bounties.find((bounty) => bounty.id === bountyId))
      .filter((bounty): bounty is Bounty => Boolean(bounty))
  },

  getPackageStatus(snapshot: DesignSnapshot, packageId: string) {
    return packageStatus(this.getPackageBounties(snapshot, packageId))
  },

  getPackageReward(snapshot: DesignSnapshot, packageId: string) {
    return this.getPackageBounties(snapshot, packageId).reduce((sum, bounty) => sum + bounty.reward, 0)
  },

  async setScene(scene: 'hackathon' | 'travel'): Promise<DesignSnapshot> {
    const meta = readMeta()
    meta.activeScene = scene
    const snapshot = await this.hydrate()
    const match = snapshot.projects.find((project) => sceneFromProject(project) === scene)
    if (match) {
      meta.activeProjectId = match.id
      meta.sceneProjectIds[scene] = match.id
      writeMeta(meta)
    } else {
      writeMeta(meta)
    }
    return this.hydrate()
  },

  async connectDemoWallet(accountId = 'caro') {
    await contractService.connectWallet('MetaMask', accountId)
    return this.hydrate()
  },

  async connectInjectedWallet(connector: 'Browser Wallet' | 'Rabby' | 'MetaMask' = 'Browser Wallet') {
    await contractService.connectWallet(connector)
    return this.hydrate()
  },

  async disconnectWallet() {
    await contractService.disconnectWallet()
    return this.hydrate()
  },

  async switchAccount(accountId: string) {
    await contractService.switchAccount(accountId)
    return this.hydrate()
  },

  /** Create a promise from the design modal → mock / local / chain project. */
  async createPromise(payload: CreatePromisePayload): Promise<DesignSnapshot> {
    await ensureWallet('caro')
    const wallet = await contractService.getWalletConnection()
    const deposit = Number(payload.deposit) || 0
    if (!(deposit > 0)) throw new Error('保证金必须大于 0')
    if (payload.members.length < 1) throw new Error('至少需要一名成员')
    if (getChainMode() === 'local' && payload.members.length > LOCAL_DEMO_MEMBER_LIMIT) {
      throw new Error(`本地联调最多 ${LOCAL_DEMO_MEMBER_LIMIT} 名成员`)
    }

    if (payload.scene === 'hackathon' || payload.scene === 'travel') {
      const ticketFloor = rescuePackagePresets[payload.scene].subtasks.reduce(
        (sum, ticket) => sum + ticket.reward,
        0,
      )
      if (deposit < ticketFloor) {
        throw new Error(
          `该场景救场票面合计 ${ticketFloor}，保证金至少需要 ${ticketFloor}（当前 ${deposit}）`,
        )
      }
    }

    const category =
      payload.scene === 'custom'
        ? payload.customSceneLabel?.trim() || scenePresets.custom.label
        : scenePresets[payload.scene].label

    const input: CreateProjectInput = {
      name: payload.name.trim(),
      description: `${category} · 共同承诺`,
      category,
      goal: payload.members.map((m) => m.task).join('；'),
      startDate: new Date().toISOString().slice(0, 10),
      deadline: payload.deadline || new Date().toISOString().slice(0, 10),
      members: payload.members.map((member, index) => ({
        name: member.name.trim() || '未命名成员',
        address:
          getChainMode() === 'chain' && index === 0 && wallet.account
            ? wallet.account.address
            : resolveMemberAddress(member.name),
        role: member.task.trim() || '待分配',
        task: member.task.trim() || '待分配任务',
        taskDeadline: payload.deadline || new Date().toISOString().slice(0, 10),
        deposit,
      })),
    }

    const receipt = await runTx(() => contractService.createProject(input))
    const projects = await contractService.getProjects()
    const created = projects[0]
    const meta = readMeta()
    if (created) {
      meta.activeProjectId = created.id
      if (payload.scene === 'hackathon' || payload.scene === 'travel') {
        meta.activeScene = payload.scene
        meta.sceneProjectIds[payload.scene] = created.id
      }
      writeMeta(meta)
    }
    void receipt
    return this.hydrate()
  },

  async confirmMember(projectId: string, memberId: string) {
    await ensureWallet('caro')
    await runTx(() => contractService.confirmParticipation(projectId, memberId))
    return this.hydrate()
  },

  async lockMember(projectId: string, memberId: string) {
    await ensureWallet('caro')
    await runTx(() => contractService.lockDeposit(projectId, memberId))
    return this.hydrate()
  },

  /**
   * Confirm + lock one member (design “签署” step).
   * - mock: confirmParticipation then lockDeposit
   * - local/chain: single joinProject via lockDeposit only
   */
  async signMember(projectId: string, memberId: string) {
    await ensureWallet('caro')
    const project = await contractService.getProject(projectId)
    if (!project) throw new Error('项目不存在')
    const member = project.members.find((item) => item.id === memberId)
    if (!member) throw new Error('成员不存在')
    if (member.status === 'active' || member.depositLocked) {
      return this.hydrate()
    }

    if (getChainMode() === 'chain') {
      const wallet = await contractService.getWalletConnection()
      if (!wallet.account) throw new Error('请先连接钱包')
      const already = project.members.find(
        (item) =>
          item.id !== memberId &&
          (item.depositLocked || item.status === 'active') &&
          addressesMatch(item.address, wallet.account?.address),
      )
      if (already) {
        throw new Error('当前钱包已经加入过这份承诺。请复制邀请链接，让其他成员用自己的钱包确认。')
      }
      await runTx(() => contractService.lockDeposit(projectId, memberId))
      return this.hydrate()
    }

    if (isOnChainBackend) {
      await runTx(() => contractService.lockDeposit(projectId, memberId))
      return this.hydrate()
    }

    if (member.status === 'invited') {
      await runTx(() => contractService.confirmParticipation(projectId, memberId))
    }
    const latest = await contractService.getProject(projectId)
    const refreshed = latest?.members.find((item) => item.id === memberId)
    if (refreshed && !refreshed.depositLocked) {
      await runTx(() => contractService.lockDeposit(projectId, memberId))
    }
    return this.hydrate()
  },

  async proposeExpulsion(projectId: string, memberId: string, reason: string) {
    if (!isOnChainBackend || !contractService.proposeExpulsion) {
      throw new Error('Mock 投票由演示界面处理')
    }
    const project = await contractService.getProject(projectId)
    const target = project?.members.find((member) => member.id === memberId)
    if (!target) throw new Error('目标成员不存在')
    await runTx(() => contractService.proposeExpulsion!(projectId, target.address, reason))
    return this.hydrate()
  },

  async voteExpulsion(proposalId: string, support: boolean) {
    if (!isOnChainBackend || !contractService.voteExpulsion) {
      throw new Error('Mock 投票由演示界面处理')
    }
    await runTx(() => contractService.voteExpulsion!(proposalId, support))
    return this.hydrate()
  },

  async executeExpulsion(proposalId: string) {
    if (!isOnChainBackend || !contractService.executeExpulsion) {
      throw new Error('Mock 投票由演示界面处理')
    }
    await runTx(() => contractService.executeExpulsion!(proposalId))
    return this.hydrate()
  },

  /** Build a shareable join link for a pending member seat (chain mode). */
  buildMemberInviteLink(project: Project, memberId: string): string {
    const member = project.members.find((item) => item.id === memberId)
    if (!member) throw new Error('成员不存在')
    const url = new URL('/promises', window.location.origin)
    url.searchParams.set('invite', project.id)
    url.searchParams.set('member', member.id)
    url.searchParams.set('name', member.name)
    url.searchParams.set('task', member.task)
    url.searchParams.set('deposit', String(member.deposit))
    url.searchParams.set('title', project.name)
    url.searchParams.set('category', project.category)
    return url.toString()
  },

  /** Invitee opens shared link → index project + seat meta, then hydrate. */
  async acceptMemberInvite(input: {
    projectId: string
    memberId: string
    name: string
    task: string
    deposit: number
    title: string
    category: string
  }): Promise<DesignSnapshot> {
    if (getChainMode() !== 'chain') {
      throw new Error('邀请链接仅在 Monad 公链模式下使用')
    }
    if (!contractService.ensureInviteSeat) {
      throw new Error('当前后端不支持邀请链接')
    }
    await contractService.ensureInviteSeat(input)
    const meta = readMeta()
    meta.activeProjectId = input.projectId
    writeMeta(meta)
    const snapshot = await this.hydrate()
    const project = snapshot.projects.find((item) => item.id === input.projectId)
    if (!project) {
      throw new Error(
        `链上找不到项目 #${input.projectId}。请确认邀请来自当前合约部署（创建者重新创建并复制链接），且 RPC 可访问。`,
      )
    }
    return snapshot
  },

  /**
   * Quit a member and spawn one rescue package (multiple subtask bounties under one parent).
   * Subtask rewards are scaled to fit the available rescue pool when presets exceed it.
   */
  async quitAndSpawnTickets(
    projectId: string,
    memberId: string,
    scene: 'hackathon' | 'travel',
  ): Promise<DesignSnapshot> {
    const projectBefore = await contractService.getProject(projectId)
    const quitting = projectBefore?.members.find((item) => item.id === memberId)
    if (!quitting || (quitting.status !== 'active' && !quitting.depositLocked)) {
      throw new Error('只能退出已加入并锁定保证金的成员')
    }

    await runTx(() => contractService.quitProject(projectId, memberId))
    await spawnRescuePackage(projectId, memberId, scene)
    return this.hydrate()
  },

  /** Publish rescue tasks after governance already removed the member and funded the pool. */
  async spawnTicketsForRemovedMember(
    projectId: string,
    memberId: string,
    scene: 'hackathon' | 'travel',
  ): Promise<DesignSnapshot> {
    await spawnRescuePackage(projectId, memberId, scene)
    return this.hydrate()
  },

  async claimBounty(bountyId: string) {
    await ensureWallet('builder-07')
    await runTx(() => contractService.claimBounty(bountyId))
    return this.hydrate()
  },

  /** Claim every open subtask in the package (strategy A). */
  async claimRescuePackage(packageId: string) {
    await ensureWallet('builder-07')
    const pkg = this.getRescuePackage(packageId)
    if (!pkg) throw new Error('救场任务不存在')
    const bounties = await contractService.getBounties()
    const openIds = pkg.bountyIds.filter((id) => bounties.find((item) => item.id === id)?.status === 'open')
    if (openIds.length === 0) throw new Error('该救场任务没有可领取的子项')
    for (const bountyId of openIds) {
      await runTx(() => contractService.claimBounty(bountyId))
    }
    return this.hydrate()
  },

  async submitBounty(bountyId: string, link: string, note: string) {
    await ensureWallet('builder-07')
    const submission: Omit<WorkSubmission, 'submittedAt'> = {
      githubUrl: link,
      demoUrl: link,
      summary: note || '已提交救场成果，等待验收。',
      testNotes: note,
      handoverNotes: note,
    }
    await runTx(() => contractService.submitWork(bountyId, submission))
    return this.hydrate()
  },

  /** Submit the same proof against every claimable subtask in the package. */
  async submitRescuePackage(packageId: string, link: string, note: string) {
    await ensureWallet('builder-07')
    const pkg = this.getRescuePackage(packageId)
    if (!pkg) throw new Error('救场任务不存在')
    const bounties = await contractService.getBounties()
    const targets = pkg.bountyIds.filter((id) => {
      const status = bounties.find((item) => item.id === id)?.status
      return status === 'claimed' || status === 'revision_required'
    })
    if (targets.length === 0) throw new Error('没有可提交的子项，请先领取整包任务')
    const submission: Omit<WorkSubmission, 'submittedAt'> = {
      githubUrl: link,
      demoUrl: link,
      summary: note || '已提交完整救场成果，等待验收。',
      testNotes: note,
      handoverNotes: note,
    }
    for (const bountyId of targets) {
      await runTx(() => contractService.submitWork(bountyId, submission))
    }
    return this.hydrate()
  },

  async requestRevision(bountyId: string, reason = '请按交付清单补充材料后再提交') {
    await ensureWallet('caro')
    await runTx(() => contractService.requestRevision(bountyId, reason))
    return this.hydrate()
  },

  async requestPackageRevision(packageId: string, reason = '请按全部交付项补充材料后再提交') {
    await ensureWallet('caro')
    const pkg = this.getRescuePackage(packageId)
    if (!pkg) throw new Error('救场任务不存在')
    const bounties = await contractService.getBounties()
    const targets = pkg.bountyIds.filter((id) => bounties.find((item) => item.id === id)?.status === 'submitted')
    if (targets.length === 0) throw new Error('没有待验收的子项')
    for (const bountyId of targets) {
      await runTx(() => contractService.requestRevision(bountyId, reason))
    }
    return this.hydrate()
  },

  async approveAndPay(bountyId: string) {
    await ensureWallet('caro')
    await runTx(() => contractService.approveAndPay(bountyId))
    return this.hydrate()
  },

  async approveRescuePackage(packageId: string) {
    await ensureWallet('caro')
    const pkg = this.getRescuePackage(packageId)
    if (!pkg) throw new Error('救场任务不存在')
    const bounties = await contractService.getBounties()
    const targets = pkg.bountyIds.filter((id) => bounties.find((item) => item.id === id)?.status === 'submitted')
    if (targets.length === 0) throw new Error('没有待验收的子项')
    for (const bountyId of targets) {
      await runTx(() => contractService.approveAndPay(bountyId))
    }
    return this.hydrate()
  },

  /**
   * Owner marks the promise successfully finished (no forced exit path).
   * Maps to on-chain finishProject — requires reservedBounty == 0.
   */
  async completePromise(projectId: string): Promise<DesignSnapshot> {
    const wallet = await ensureWallet('caro')
    const project = await contractService.getProject(projectId)
    if (!project) throw new Error('项目不存在')
    if (!this.isActiveProjectStatus(project.status)) {
      throw new Error('该承诺已结束，无需再次结算')
    }
    if (getChainMode() !== 'mock') {
      if (!addressesMatch(project.creatorAddress, wallet.account?.address)) {
        throw new Error('只有承诺创建者可以提交「任务完成」。请切换到创建该承诺的钱包后再试。')
      }
    }
    if (project.reservedBounty > 0) {
      throw new Error('仍有未结清的救场悬赏，请先完成验收支付后再点「任务完成」')
    }
    const snapshot = await this.hydrate()
    const openRescue = this.listRescuePackagesForProject(snapshot, projectId).filter((pkg) => {
      const status = this.getPackageStatus(snapshot, pkg.id)
      return !['paid', 'approved', 'rejected', 'cancelled'].includes(status)
    })
    if (openRescue.length > 0) {
      throw new Error('救场大厅仍有进行中的任务，请先完成救场验收后再结算承诺')
    }
    await runTx(() => contractService.completeProject(projectId))
    return this.hydrate()
  },

  async resetDemo() {
    await contractService.resetDemo()
    writeMeta({
      activeScene: 'hackathon',
      activeProjectId: '',
      sceneProjectIds: {},
      ticketMeta: {},
      rescuePackages: [],
    })
    // Drop legacy meta key from older demos.
    localStorage.removeItem('dont-ghost-me:design-meta:v1')
    return this.hydrate()
  },

  async loadGovernanceDemo(): Promise<DesignSnapshot> {
    if (getChainMode() !== 'mock' || !contractService.loadGovernanceDemo) {
      throw new Error('投票演示只在 Mock 模式可用')
    }
    await contractService.loadGovernanceDemo()
    const meta = readMeta()
    meta.activeProjectId = GOVERNANCE_DEMO_PROJECT_ID
    meta.activeScene = 'hackathon'
    meta.sceneProjectIds.hackathon = GOVERNANCE_DEMO_PROJECT_ID
    writeMeta(meta)
    return this.hydrate()
  },

  async executeMockExpulsion(projectId: string, memberId: string): Promise<DesignSnapshot> {
    if (getChainMode() !== 'mock' || !contractService.executeMockExpulsion) {
      throw new Error('Mock 移除执行不可用')
    }
    await runTx(() => contractService.executeMockExpulsion!(projectId, memberId))
    return this.hydrate()
  },

  getActiveProject(snapshot: DesignSnapshot): Project | undefined {
    return snapshot.projects.find((project) => project.id === snapshot.activeProjectId)
  },

  /** Workbench target: prefer living active project over a finished activeProjectId. */
  resolveWorkbenchProject(snapshot: DesignSnapshot): Project | undefined {
    const preferred = this.getActiveProject(snapshot)
    if (preferred && this.isActiveProjectStatus(preferred.status)) return preferred
    return this.listMyProjects(snapshot, 'active')[0]
  },

  getProjectBounties(snapshot: DesignSnapshot, projectId?: string): Bounty[] {
    const id = projectId ?? snapshot.activeProjectId
    return snapshot.bounties.filter((bounty) => bounty.projectId === id)
  },

  isActiveProjectStatus(status: Project['status']) {
    return !['completed', 'cancelled'].includes(status)
  },

  listMyProjects(snapshot: DesignSnapshot, filter: 'active' | 'done' | 'all' = 'all'): Project[] {
    if (filter === 'active') return snapshot.projects.filter((project) => this.isActiveProjectStatus(project.status))
    if (filter === 'done') return snapshot.projects.filter((project) => !this.isActiveProjectStatus(project.status))
    return snapshot.projects
  },

  listRescuePackages(
    snapshot: DesignSnapshot,
    scope: 'open' | 'mine' | 'done' | 'all' = 'all',
  ): RescuePackageMeta[] {
    const account = snapshot.wallet.account
    return snapshot.rescuePackages.filter((pkg) => {
      const status = this.getPackageStatus(snapshot, pkg.id)
      const bounties = this.getPackageBounties(snapshot, pkg.id)
      const isMine = Boolean(
        account &&
          bounties.some(
            (bounty) =>
              bounty.rescuerId === account.id ||
              (bounty.rescuerAddress &&
                bounty.rescuerAddress.toLowerCase() === account.address.toLowerCase()),
          ),
      )
      if (scope === 'open') return status === 'open'
      if (scope === 'mine') return isMine && status !== 'open' && status !== 'paid' && status !== 'cancelled'
      if (scope === 'done') return ['paid', 'approved', 'rejected', 'cancelled'].includes(status)
      return true
    })
  },

  getProfileSummary(snapshot: DesignSnapshot) {
    const activeProjects = this.listMyProjects(snapshot, 'active')
    const doneProjects = this.listMyProjects(snapshot, 'done')
    const openRescue = this.listRescuePackages(snapshot, 'open')
    const mineRescue = this.listRescuePackages(snapshot, 'mine')
    return {
      activeProjectCount: activeProjects.length,
      doneProjectCount: doneProjects.length,
      openRescueCount: openRescue.length,
      mineRescueCount: mineRescue.length,
    }
  },

  async setActiveProject(projectId: string): Promise<DesignSnapshot> {
    const meta = readMeta()
    meta.activeProjectId = projectId
    writeMeta(meta)
    return this.hydrate()
  },

  findQuitCandidate(project: Project): ProjectMember | undefined {
    const joined = project.members.filter(
      (member) =>
        member.status !== 'quit' && (member.status === 'active' || member.depositLocked),
    )
    if (joined.length === 0) return undefined
    return (
      joined.find(
        (member) =>
          member.id === 'yunn' ||
          member.id === 'yoyo' ||
          member.name === 'Kai' ||
          member.name === 'Lin' ||
          member.name === 'Mia',
      ) ??
      joined.find(
        (member) =>
          member.id !== 'caro' && !addressesMatch(member.address, project.creatorAddress),
      ) ??
      joined[0]
    )
  },

  /** Members who can call leaveProject (joined / deposit locked). */
  listQuittableMembers(project: Project): ProjectMember[] {
    return project.members.filter(
      (member) =>
        member.status !== 'quit' && (member.status === 'active' || member.depositLocked),
    )
  },

  /** True when every non-quit member has joined (demo gate before exit → rescue). */
  allMembersJoined(project: Project): boolean {
    const pending = project.members.filter(
      (member) =>
        member.status !== 'quit' && member.status !== 'active' && !member.depositLocked,
    )
    return project.members.length > 0 && pending.length === 0
  },
}
