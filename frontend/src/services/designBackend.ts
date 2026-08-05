import type {
  Bounty,
  CreateProjectInput,
  Project,
  ProjectMember,
  TransactionReceipt,
  WalletConnection,
  WorkSubmission,
} from '../contracts/types'
import {
  type DesignSceneKey,
  type RescueTicketDraft,
  rescueTicketTemplates,
  scenePresets,
  ticketDraftToCreateInput,
} from '../data/scenePresets'
import { DEMO_PROJECT_ID, TRAVEL_PROJECT_ID } from '../data/mockData'
import { contractService } from './contractService'

export interface DesignSnapshot {
  wallet: WalletConnection
  projects: Project[]
  bounties: Bounty[]
  activeProjectId: string
  activeScene: 'hackathon' | 'travel'
}

export interface CreatePromisePayload {
  scene: DesignSceneKey
  name: string
  deadline: string
  deposit: number
  members: Array<{ name: string; task: string }>
  customSceneLabel?: string
}

const SCENE_PROJECT: Record<'hackathon' | 'travel', string> = {
  hackathon: DEMO_PROJECT_ID,
  travel: TRAVEL_PROJECT_ID,
}

const META_KEY = 'dont-ghost-me:design-meta:v1'

interface DesignMeta {
  activeScene: 'hackathon' | 'travel'
  activeProjectId: string
  /** Extra display fields keyed by bounty id */
  ticketMeta: Record<string, Partial<RescueTicketDraft>>
}

function readMeta(): DesignMeta {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (raw) return JSON.parse(raw) as DesignMeta
  } catch {
    /* ignore */
  }
  return {
    activeScene: 'hackathon',
    activeProjectId: DEMO_PROJECT_ID,
    ticketMeta: {},
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
  if (connection.isConnected && connection.account) return connection
  return contractService.connectWallet('MetaMask', accountId)
}

function fakeAddress(seed: string): `0x${string}` {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return `0x${hash.toString(16).padStart(17, '0').slice(0, 17)}`
}

/**
 * Design-facing fake backend.
 * Wraps mockContractService so the V11 UI can create / mutate real local state.
 * Later swap contractService binding to viem — this facade stays.
 */
export const designBackend = {
  async hydrate(): Promise<DesignSnapshot> {
    const meta = readMeta()
    const [wallet, projects, bounties] = await Promise.all([
      contractService.getWalletConnection(),
      contractService.getProjects(),
      contractService.getBounties(),
    ])
    const activeProjectId = projects.some((p) => p.id === meta.activeProjectId)
      ? meta.activeProjectId
      : (projects[0]?.id ?? DEMO_PROJECT_ID)
    if (activeProjectId !== meta.activeProjectId) {
      meta.activeProjectId = activeProjectId
      writeMeta(meta)
    }
    return {
      wallet,
      projects,
      bounties,
      activeProjectId,
      activeScene: meta.activeScene,
    }
  },

  getTicketMeta(bountyId: string) {
    return readMeta().ticketMeta[bountyId]
  },

  async setScene(scene: 'hackathon' | 'travel'): Promise<DesignSnapshot> {
    const meta = readMeta()
    meta.activeScene = scene
    meta.activeProjectId = SCENE_PROJECT[scene]
    writeMeta(meta)
    return this.hydrate()
  },

  async connectDemoWallet(accountId = 'caro') {
    await contractService.connectWallet('MetaMask', accountId)
    return this.hydrate()
  },

  async switchAccount(accountId: string) {
    await contractService.switchAccount(accountId)
    return this.hydrate()
  },

  /** Create a promise from the design modal → mock chain project. */
  async createPromise(payload: CreatePromisePayload): Promise<DesignSnapshot> {
    await ensureWallet('caro')
    const deposit = Number(payload.deposit) || 0
    const category =
      payload.scene === 'custom'
        ? payload.customSceneLabel?.trim() || scenePresets.custom.label
        : scenePresets[payload.scene].label

    const input: CreateProjectInput = {
      name: payload.name.trim(),
      description: `${category} · 由设计工作台创建的共同承诺`,
      category,
      goal: payload.members.map((m) => m.task).join('；'),
      startDate: new Date().toISOString().slice(0, 10),
      deadline: payload.deadline || new Date().toISOString().slice(0, 10),
      members: payload.members.map((member) => ({
        name: member.name.trim() || '未命名成员',
        address: fakeAddress(member.name),
        role: member.task.trim() || '待分配',
        task: member.task.trim() || '待分配任务',
        taskDeadline: payload.deadline || new Date().toISOString().slice(0, 10),
        deposit,
      })),
    }

    const receipt = await runTx(() => contractService.createProject(input))
    const projects = await contractService.getProjects()
    // Newest project is prepended by mock service.
    const created = projects[0]
    const meta = readMeta()
    if (created) {
      meta.activeProjectId = created.id
      if (payload.scene === 'hackathon' || payload.scene === 'travel') meta.activeScene = payload.scene
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

  /** Confirm + lock one member (design “签署” step). */
  async signMember(projectId: string, memberId: string) {
    await ensureWallet('caro')
    const project = await contractService.getProject(projectId)
    const member = project?.members.find((item) => item.id === memberId)
    if (!member) throw new Error('成员不存在')
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

  /**
   * Quit a member and auto-publish rescue tickets (design exit receipt).
   * Matches V11: leave → pool → multiple bounty tickets.
   */
  async quitAndSpawnTickets(
    projectId: string,
    memberId: string,
    scene: 'hackathon' | 'travel',
  ): Promise<DesignSnapshot> {
    await ensureWallet('caro')
    await runTx(() => contractService.quitProject(projectId, memberId))

    const templates = rescueTicketTemplates[scene]
    const meta = readMeta()
    for (const ticket of templates) {
      await runTx(() =>
        contractService.createBounty(ticketDraftToCreateInput(projectId, memberId, ticket)),
      )
      // Avoid identical Date.now() ids when creating multiple tickets in one burst.
      await new Promise((resolve) => window.setTimeout(resolve, 40))
      const bounties = await contractService.getBounties()
      const created = bounties.find(
        (bounty) => bounty.projectId === projectId && bounty.title === ticket.title && bounty.status === 'open',
      )
      if (created) {
        meta.ticketMeta[created.id] = ticket
      }
    }
    meta.activeScene = scene
    meta.activeProjectId = projectId
    writeMeta(meta)
    return this.hydrate()
  },

  async claimBounty(bountyId: string) {
    await ensureWallet('builder-07')
    await runTx(() => contractService.claimBounty(bountyId))
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

  async requestRevision(bountyId: string, reason = '请按交付清单补充材料后再提交') {
    await ensureWallet('caro')
    await runTx(() => contractService.requestRevision(bountyId, reason))
    return this.hydrate()
  },

  async approveAndPay(bountyId: string) {
    await ensureWallet('caro')
    await runTx(() => contractService.approveAndPay(bountyId))
    return this.hydrate()
  },

  async resetDemo() {
    await contractService.resetDemo()
    writeMeta({
      activeScene: 'hackathon',
      activeProjectId: DEMO_PROJECT_ID,
      ticketMeta: {},
    })
    return this.hydrate()
  },

  getActiveProject(snapshot: DesignSnapshot): Project | undefined {
    return snapshot.projects.find((project) => project.id === snapshot.activeProjectId)
  },

  getProjectBounties(snapshot: DesignSnapshot, projectId?: string): Bounty[] {
    const id = projectId ?? snapshot.activeProjectId
    return snapshot.bounties.filter((bounty) => bounty.projectId === id)
  },

  findQuitCandidate(project: Project): ProjectMember | undefined {
    return (
      project.members.find((member) => member.status === 'quit') ??
      project.members.find((member) => member.id === 'yunn' || member.id === 'yoyo' || member.name === 'Kai') ??
      project.members.find((member) => member.id !== 'caro' && member.status === 'active')
    )
  },
}
