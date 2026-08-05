import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  formatEther,
  http,
  parseEther,
  type Account,
  type Hash as ViemHash,
  type PublicClient,
  type WalletClient,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { ContractService } from './contractService'
import type {
  Address,
  Bounty,
  BountyStatus,
  CreateBountyInput,
  CreateProjectInput,
  Hash,
  Project,
  ProjectMember,
  ProjectStatus,
  TransactionReceipt,
  WalletAccount,
  WalletConnection,
  WorkSubmission,
} from '../contracts/types'
import { dontGhostMeAbi } from '../contracts/dontGhostMeAbi'
import {
  getConfiguredChain,
  getContractAddress,
  LOCAL_DEMO_MEMBER_LIMIT,
} from '../contracts/chainConfig'

const INDEX_PREFIX = 'dont-ghost-me:chain-index:v1'
const META_PREFIX = 'dont-ghost-me:chain-project-meta:v1'
const SESSION_KEY = 'dont-ghost-me:chain-session:v1'

function storageScope() {
  try {
    return `${getConfiguredChain().id}:${getContractAddress().toLowerCase()}`
  } catch {
    return 'unconfigured'
  }
}

function indexKey() {
  return `${INDEX_PREFIX}:${storageScope()}`
}

function metaKey() {
  return `${META_PREFIX}:${storageScope()}`
}

/** Anvil default keys — local/dev only. Replace with injected wallet for public chains. */
const LOCAL_DEMO_ACCOUNTS: Array<WalletAccount & { privateKey: `0x${string}` }> = [
  {
    id: 'caro',
    name: 'Caro',
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    role: 'initiator',
    avatar: 'C',
    balance: 0,
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  },
  {
    id: 'yunn',
    name: 'Yunn',
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    role: 'member',
    avatar: 'Y',
    balance: 0,
    privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  },
  {
    id: 'builder-07',
    name: 'Builder 07',
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    role: 'rescuer',
    avatar: 'B7',
    balance: 0,
    privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  },
]

interface ChainIndex {
  projectIds: string[]
  bountyIds: string[]
}

interface ProjectMeta {
  description?: string
  category?: string
  goal?: string
  startDate?: string
  deadline?: string
  members?: Array<{
    id: string
    name: string
    address: Address
    role: string
    task: string
    taskDeadline: string
    deposit: number
    accountId?: string
  }>
  timeline?: Project['timeline']
  submissions?: Record<string, WorkSubmission>
  scene?: string
}

interface ProjectMetaStore {
  byProjectId: Record<string, ProjectMeta>
  bountyTitles: Record<string, Partial<Bounty>>
}

function readIndex(): ChainIndex {
  try {
    const raw = localStorage.getItem(indexKey())
    if (raw) return JSON.parse(raw) as ChainIndex
  } catch {
    /* ignore */
  }
  return { projectIds: [], bountyIds: [] }
}

function writeIndex(index: ChainIndex) {
  localStorage.setItem(indexKey(), JSON.stringify(index))
}

function readMetaStore(): ProjectMetaStore {
  try {
    const raw = localStorage.getItem(metaKey())
    if (raw) return JSON.parse(raw) as ProjectMetaStore
  } catch {
    /* ignore */
  }
  return { byProjectId: {}, bountyTitles: {} }
}

function writeMetaStore(store: ProjectMetaStore) {
  localStorage.setItem(metaKey(), JSON.stringify(store))
}

function readSession(): WalletConnection {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (raw) return JSON.parse(raw) as WalletConnection
  } catch {
    /* ignore */
  }
  return { isConnected: false }
}

function writeSession(connection: WalletConnection) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(connection))
}

function emitUpdate() {
  window.dispatchEvent(new CustomEvent('dont-ghost-me:chain-updated'))
}

function toDisplayMon(wei: bigint): number {
  return Number(formatEther(wei))
}

function toWei(amount: number): bigint {
  // UI uses whole MON-like units; map 1 → 1 ether for Anvil/Monad-native demos.
  return parseEther(String(amount))
}

/** Map Solidity ProjectStatus (Active/Finished/Cancelled) to UI status. */
function mapProjectStatus(status: number): ProjectStatus {
  if (status === 1) return 'completed' // Finished
  if (status === 2) return 'cancelled' // Cancelled
  return 'active'
}

/** Map Solidity BountyStatus enum 0..7 — never reuse approved/open for Rejected/Cancelled. */
function mapBountyStatus(status: number): BountyStatus {
  const table: BountyStatus[] = [
    'open', // Open
    'claimed', // Claimed
    'submitted', // Submitted
    'revision_required', // RevisionRequested
    'approved', // Approved
    'rejected', // Rejected
    'paid', // Paid
    'cancelled', // Cancelled
  ]
  return table[status] ?? 'open'
}

/**
 * Derive member UI status from on-chain Member.
 * leaveProject sets active=false but does NOT set withdrawn — that must still be quit.
 */
function deriveMemberStatus(onChain: { account: Address; active: boolean; withdrawn: boolean }): ProjectMember['status'] {
  if (onChain.account === '0x0000000000000000000000000000000000000000') return 'invited'
  if (onChain.active) return 'active'
  return 'quit'
}

let publicClient: PublicClient | undefined
let cachedAddress: `0x${string}` | undefined

function getPublic(): PublicClient {
  if (!publicClient) {
    const chain = getConfiguredChain()
    publicClient = createPublicClient({
      chain,
      transport: http(chain.rpcUrls.default.http[0]),
    })
  }
  return publicClient
}

function getAddress() {
  if (!cachedAddress) cachedAddress = getContractAddress()
  return cachedAddress
}

function accountById(accountId: string) {
  const found = LOCAL_DEMO_ACCOUNTS.find((item) => item.id === accountId)
  if (!found) throw new Error(`本地演示账户不存在: ${accountId}`)
  return found
}

function walletFor(accountId: string): { account: Account; client: WalletClient; profile: (typeof LOCAL_DEMO_ACCOUNTS)[number] } {
  const profile = accountById(accountId)
  const account = privateKeyToAccount(profile.privateKey)
  const chain = getConfiguredChain()
  const client = createWalletClient({
    account,
    chain,
    transport: http(chain.rpcUrls.default.http[0]),
  })
  return { account, client, profile }
}

function currentAccountId(): string {
  const session = readSession()
  if (!session.isConnected || !session.account) throw new Error('请先连接钱包')
  return session.account.id
}

async function refreshBalance(profile: (typeof LOCAL_DEMO_ACCOUNTS)[number]) {
  const balance = await getPublic().getBalance({ address: profile.address })
  profile.balance = toDisplayMon(balance)
  return profile.balance
}

async function writeContract(
  method: string,
  accountId: string,
  functionName: string,
  args: readonly unknown[],
  value?: bigint,
): Promise<{ hash: Hash; message: string }> {
  const { client, account, profile } = walletFor(accountId)
  const hash = await client.writeContract({
    address: getAddress(),
    abi: dontGhostMeAbi,
    functionName: functionName as never,
    args: args as never,
    account,
    chain: getConfiguredChain(),
    value,
  })
  const receipt = await getPublic().waitForTransactionReceipt({ hash })
  const ok = receipt.status === 'success'
  const message = ok ? `${method} 成功` : `${method} 失败`
  const localReceipt: TransactionReceipt = {
    hash: hash as Hash,
    status: ok ? 'success' : 'failed',
    blockNumber: Number(receipt.blockNumber),
    timestamp: new Date().toISOString(),
    method,
    from: profile.address,
    message,
    error: ok ? undefined : '链上交易失败',
  }
  sessionStorage.setItem(`dont-ghost-me:receipt:${hash}`, JSON.stringify(localReceipt))
  emitUpdate()
  if (!ok) throw new Error(localReceipt.error)
  return { hash: hash as Hash, message }
}

function rememberProjectId(id: string) {
  const index = readIndex()
  if (!index.projectIds.includes(id)) {
    index.projectIds.unshift(id)
    writeIndex(index)
  }
}

function rememberBountyId(id: string) {
  const index = readIndex()
  if (!index.bountyIds.includes(id)) {
    index.bountyIds.unshift(id)
    writeIndex(index)
  }
}

async function syncIndexesFromEvents() {
  try {
    const publicC = getPublic()
    const address = getAddress()
    const [projectLogs, bountyLogs] = await Promise.all([
      publicC.getContractEvents({
        address,
        abi: dontGhostMeAbi,
        eventName: 'ProjectCreated',
        fromBlock: 0n,
        toBlock: 'latest',
      }),
      publicC.getContractEvents({
        address,
        abi: dontGhostMeAbi,
        eventName: 'BountyCreated',
        fromBlock: 0n,
        toBlock: 'latest',
      }),
    ])

    const index = readIndex()
    for (const log of projectLogs) {
      const id = String(log.args.projectId)
      if (id && !index.projectIds.includes(id)) index.projectIds.push(id)
    }
    for (const log of bountyLogs) {
      const id = String(log.args.bountyId)
      if (id && !index.bountyIds.includes(id)) index.bountyIds.push(id)
    }
    writeIndex(index)
  } catch (error) {
    console.warn('[viem] syncIndexesFromEvents failed', error)
  }
}

async function readChainProject(projectId: string): Promise<Project | undefined> {
  const raw = await getPublic().readContract({
    address: getAddress(),
    abi: dontGhostMeAbi,
    functionName: 'getProject',
    args: [BigInt(projectId)],
  })
  if (!raw || raw.owner === '0x0000000000000000000000000000000000000000') return undefined

  const meta = readMetaStore().byProjectId[projectId] ?? {}
  const deposit = toDisplayMon(raw.depositAmount)
  const members: ProjectMember[] = []

  if (meta.members?.length) {
    for (const member of meta.members) {
      let status: ProjectMember['status'] = 'invited'
      let depositLocked = false
      try {
        const onChain = await getPublic().readContract({
          address: getAddress(),
          abi: dontGhostMeAbi,
          functionName: 'getMember',
          args: [BigInt(projectId), member.address as Address],
        })
        status = deriveMemberStatus(onChain)
        depositLocked = Boolean(onChain.active)
      } catch {
        // getMember reverts with "Member not found" before join — keep invited, do not fail hydrate.
        status = 'invited'
        depositLocked = false
      }
      members.push({
        id: member.id,
        name: member.name,
        address: member.address,
        role: member.role,
        task: member.task,
        taskDeadline: member.taskDeadline,
        deposit: member.deposit || deposit,
        depositLocked,
        status,
      })
    }
  }

  const chainStatus = mapProjectStatus(Number(raw.status))
  const awaiting = members.length > 0 && members.some((m) => m.status === 'invited')
  const hasQuit = members.some((m) => m.status === 'quit')
  const rescuePool = toDisplayMon(raw.rescuePool)
  const reservedBounty = toDisplayMon(raw.reservedBounty)

  let uiStatus: ProjectStatus = chainStatus
  if (chainStatus === 'active') {
    if (awaiting) uiStatus = 'awaiting_confirmation'
    else if (hasQuit && rescuePool > 0) uiStatus = reservedBounty > 0 ? 'rescue_in_progress' : 'rescue_needed'
  }

  return {
    id: projectId,
    name: raw.name,
    description: meta.description ?? raw.name,
    category: meta.category ?? '链上项目',
    goal: meta.goal ?? '',
    creatorAddress: raw.owner,
    startDate: meta.startDate ?? new Date().toISOString().slice(0, 10),
    deadline: meta.deadline ?? new Date().toISOString().slice(0, 10),
    status: uiStatus,
    progress: chainStatus === 'completed' ? 100 : awaiting ? 0 : hasQuit ? 35 : 40,
    totalDeposit: deposit * Math.max(members.length, 1),
    lockedDeposit: members.filter((m) => m.depositLocked).reduce((sum, m) => sum + m.deposit, 0),
    rescuePool,
    reservedBounty,
    members,
    timeline: meta.timeline ?? [
      {
        id: `onchain-${projectId}`,
        type: 'project',
        title: '项目已上链',
        description: `合约项目 #${projectId}`,
        timestamp: new Date().toISOString(),
      },
    ],
  }
}

async function readChainBounty(bountyId: string): Promise<Bounty | undefined> {
  const raw = await getPublic().readContract({
    address: getAddress(),
    abi: dontGhostMeAbi,
    functionName: 'getBounty',
    args: [BigInt(bountyId)],
  })
  if (!raw || raw.projectId === 0n) return undefined
  const extra = readMetaStore().bountyTitles[bountyId] ?? {}
  const projectMeta = readMetaStore().byProjectId[String(raw.projectId)]
  const submission = projectMeta?.submissions?.[bountyId]
  return {
    id: bountyId,
    projectId: String(raw.projectId),
    title: extra.title ?? (raw.description.slice(0, 40) || `悬赏 #${bountyId}`),
    description: raw.description,
    skills: extra.skills ?? [],
    deliverables: extra.deliverables ?? [],
    acceptanceCriteria: extra.acceptanceCriteria ?? [],
    deadline: extra.deadline ?? new Date().toISOString(),
    reward: toDisplayMon(raw.reward),
    allowMultiple: false,
    publisherName: extra.publisherName ?? 'Owner',
    publisherAddress: raw.creator,
    sourceMemberId: extra.sourceMemberId ?? '',
    sourceNote: extra.sourceNote ?? '奖励来自救场池',
    status: mapBountyStatus(Number(raw.status)),
    rescuerAddress: raw.hunter === '0x0000000000000000000000000000000000000000' ? undefined : raw.hunter,
    rescuerId: LOCAL_DEMO_ACCOUNTS.find((a) => a.address.toLowerCase() === raw.hunter.toLowerCase())?.id,
    rescuerName: LOCAL_DEMO_ACCOUNTS.find((a) => a.address.toLowerCase() === raw.hunter.toLowerCase())?.name,
    submission,
    revisionFeedback: raw.reviewReason || undefined,
  }
}

export const viemContractService: ContractService = {
  async connectWallet(_connector = 'MetaMask', accountId = 'caro') {
    const profile = accountById(accountId)
    await refreshBalance(profile)
    const connection: WalletConnection = {
      isConnected: true,
      connector: 'MetaMask',
      account: {
        id: profile.id,
        name: profile.name,
        address: profile.address,
        role: profile.role,
        avatar: profile.avatar,
        balance: profile.balance,
      },
    }
    writeSession(connection)
    await syncIndexesFromEvents()
    emitUpdate()
    return connection
  },

  async disconnectWallet() {
    writeSession({ isConnected: false })
    emitUpdate()
  },

  async switchAccount(accountId) {
    return this.connectWallet('MetaMask', accountId)
  },

  async getWalletConnection() {
    const session = readSession()
    if (!session.isConnected || !session.account) return { isConnected: false }
    const profile = LOCAL_DEMO_ACCOUNTS.find((item) => item.id === session.account?.id)
    if (profile) {
      await refreshBalance(profile)
      session.account.balance = profile.balance
      writeSession(session)
    }
    return session
  },

  async getAccounts() {
    for (const profile of LOCAL_DEMO_ACCOUNTS) {
      try {
        await refreshBalance(profile)
      } catch {
        /* rpc down */
      }
    }
    return LOCAL_DEMO_ACCOUNTS.map(({ privateKey: _pk, ...rest }) => rest)
  },

  async createProject(input: CreateProjectInput) {
    if (input.members.length < 2) throw new Error('本地链演示至少需要 2 名成员')
    if (input.members.length > LOCAL_DEMO_MEMBER_LIMIT) {
      throw new Error(`本地链演示最多 ${LOCAL_DEMO_MEMBER_LIMIT} 名成员（Anvil 测试账户不足）`)
    }
    const deposit = input.members[0]?.deposit ?? 0
    if (!(deposit > 0)) throw new Error('保证金必须大于 0')

    const accountId = currentAccountId()
    const { hash } = await writeContract('createProject', accountId, 'createProject', [
      input.name,
      toWei(deposit),
    ])

    const receipt = await getPublic().waitForTransactionReceipt({ hash: hash as ViemHash })
    let projectId = ''
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: dontGhostMeAbi, data: log.data, topics: log.topics })
        if (decoded.eventName === 'ProjectCreated') {
          projectId = String((decoded.args as { projectId: bigint }).projectId)
        }
      } catch {
        /* not our event */
      }
    }
    if (!projectId) {
      const next = await getPublic().readContract({
        address: getAddress(),
        abi: dontGhostMeAbi,
        functionName: 'nextProjectId',
      })
      projectId = String(next - 1n)
    }

    rememberProjectId(projectId)
    const store = readMetaStore()
    store.byProjectId[projectId] = {
      description: input.description,
      category: input.category,
      goal: input.goal,
      startDate: input.startDate,
      deadline: input.deadline,
      scene: /旅行|travel/i.test(input.category) ? 'travel' : /黑客|hack/i.test(input.category) ? 'hackathon' : 'custom',
      members: input.members.map((member, index) => {
        const demo = LOCAL_DEMO_ACCOUNTS[index]
        if (!demo) throw new Error(`缺少第 ${index + 1} 个本地演示账户`)
        return {
          id: demo.id,
          // Force display name to match the signing account — never drift from address map.
          name: demo.name,
          address: demo.address as Address,
          role: member.role,
          task: member.task,
          taskDeadline: member.taskDeadline,
          deposit: member.deposit,
          accountId: demo.id,
        }
      }),
      timeline: [
        {
          id: `created-${projectId}`,
          type: 'project',
          title: '共同承诺已上链',
          description: `${input.members.length} 名成员待 joinProject 锁定保证金`,
          timestamp: new Date().toISOString(),
          txHash: hash,
        },
      ],
      submissions: {},
    }
    writeMetaStore(store)
    return { hash, status: 'pending' }
  },

  async confirmParticipation(projectId, _memberId) {
    // Local/chain: confirm is off-chain only. Real join is lockDeposit → joinProject.
    // Keep a lightweight receipt so callers that still await confirmParticipation do not fail.
    const store = readMetaStore()
    const meta = store.byProjectId[projectId]
    if (meta) {
      meta.timeline = [
        ...(meta.timeline ?? []),
        {
          id: `confirm-${Date.now()}`,
          type: 'member',
          title: '准备签署加入',
          description: '链下准备记录（上链仅一笔 joinProject）',
          timestamp: new Date().toISOString(),
        },
      ]
      writeMetaStore(store)
    }
    const hash = `0x${'c'.repeat(64)}` as Hash
    sessionStorage.setItem(
      `dont-ghost-me:receipt:${hash}`,
      JSON.stringify({
        hash,
        status: 'success',
        timestamp: new Date().toISOString(),
        method: 'confirmParticipation',
        message: '链下准备完成（请通过 joinProject 上链）',
      } satisfies TransactionReceipt),
    )
    emitUpdate()
    return { hash, status: 'pending' }
  },

  async lockDeposit(projectId, memberId) {
    const store = readMetaStore()
    const meta = store.byProjectId[projectId]
    const member = meta?.members?.find((item) => item.id === memberId)
    if (!member?.accountId) {
      throw new Error('成员未绑定本地演示账户，无法 joinProject')
    }
    const accountId = member.accountId
    const project = await getPublic().readContract({
      address: getAddress(),
      abi: dontGhostMeAbi,
      functionName: 'getProject',
      args: [BigInt(projectId)],
    })
    const { hash } = await writeContract(
      'joinProject',
      accountId,
      'joinProject',
      [BigInt(projectId)],
      project.depositAmount,
    )
    return { hash, status: 'pending' }
  },

  async quitProject(projectId, memberId) {
    const store = readMetaStore()
    const meta = store.byProjectId[projectId]
    const member = meta?.members?.find((item) => item.id === memberId)
    const accountId = member?.accountId ?? currentAccountId()
    const { hash } = await writeContract('quitProject', accountId, 'leaveProject', [BigInt(projectId)])
    return { hash, status: 'pending' }
  },

  async advanceProject(_projectId) {
    throw new Error('链上模式暂不支持里程碑推进，请使用 finishProject / 完成项目')
  },

  async completeProject(projectId) {
    const { hash } = await writeContract('completeProject', currentAccountId(), 'finishProject', [
      BigInt(projectId),
    ])
    return { hash, status: 'pending' }
  },

  async batchResolveBounties(_projectId) {
    throw new Error('链上模式请逐笔验收悬赏（approveWork）')
  },

  async createBounty(input: CreateBountyInput) {
    const { hash } = await writeContract('createBounty', currentAccountId(), 'createBounty', [
      BigInt(input.projectId),
      input.description || input.title,
      toWei(input.reward),
    ])
    const receipt = await getPublic().waitForTransactionReceipt({ hash: hash as ViemHash })
    let bountyId = ''
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: dontGhostMeAbi, data: log.data, topics: log.topics })
        if (decoded.eventName === 'BountyCreated') {
          bountyId = String((decoded.args as { bountyId: bigint }).bountyId)
        }
      } catch {
        /* ignore */
      }
    }
    if (!bountyId) {
      const next = await getPublic().readContract({
        address: getAddress(),
        abi: dontGhostMeAbi,
        functionName: 'nextBountyId',
      })
      bountyId = String(next - 1n)
    }
    rememberBountyId(bountyId)
    const store = readMetaStore()
    store.bountyTitles[bountyId] = {
      title: input.title,
      skills: input.skills,
      deliverables: input.deliverables,
      acceptanceCriteria: input.acceptanceCriteria,
      deadline: input.deadline,
      sourceMemberId: input.sourceMemberId,
      publisherName: readSession().account?.name,
    }
    writeMetaStore(store)
    return { hash, status: 'pending' }
  },

  async claimBounty(bountyId) {
    let accountId = currentAccountId()
    const profile = accountById(accountId)
    if (profile.role !== 'rescuer') accountId = 'builder-07'
    const { hash } = await writeContract('claimBounty', accountId, 'claimBounty', [BigInt(bountyId)])
    await this.connectWallet('MetaMask', accountId)
    return { hash, status: 'pending' }
  },

  async cancelBountyClaim(bountyId) {
    const { hash } = await writeContract('cancelBountyClaim', currentAccountId(), 'cancelClaim', [
      BigInt(bountyId),
    ])
    return { hash, status: 'pending' }
  },

  async submitWork(bountyId, submission) {
    const { hash } = await writeContract('submitWork', currentAccountId(), 'submitWork', [BigInt(bountyId)])
    const bounty = await readChainBounty(bountyId)
    if (bounty) {
      const store = readMetaStore()
      const meta = store.byProjectId[bounty.projectId] ?? { submissions: {} }
      meta.submissions = { ...(meta.submissions ?? {}), [bountyId]: { ...submission, submittedAt: new Date().toISOString() } }
      store.byProjectId[bounty.projectId] = meta
      writeMetaStore(store)
    }
    return { hash, status: 'pending' }
  },

  async requestRevision(bountyId, feedback) {
    const { hash } = await writeContract('requestRevision', currentAccountId(), 'requestRevision', [
      BigInt(bountyId),
      feedback,
    ])
    return { hash, status: 'pending' }
  },

  async approveAndPay(bountyId) {
    const { hash } = await writeContract('approveAndPay', currentAccountId(), 'approveWork', [BigInt(bountyId)])
    return { hash, status: 'pending' }
  },

  async getProject(projectId) {
    await syncIndexesFromEvents()
    return readChainProject(projectId)
  },

  async getProjects() {
    await syncIndexesFromEvents()
    const index = readIndex()
    const projects: Project[] = []
    for (const id of index.projectIds) {
      const project = await readChainProject(id)
      if (project) projects.push(project)
    }
    return projects
  },

  async getBounty(bountyId) {
    await syncIndexesFromEvents()
    return readChainBounty(bountyId)
  },

  async getBounties() {
    await syncIndexesFromEvents()
    const index = readIndex()
    const bounties: Bounty[] = []
    for (const id of index.bountyIds) {
      const bounty = await readChainBounty(id)
      if (bounty) bounties.push(bounty)
    }
    return bounties
  },

  async getWalletBalance(address?: Address) {
    const target = address ?? readSession().account?.address
    if (!target) return 0
    const balance = await getPublic().getBalance({ address: target })
    return toDisplayMon(balance)
  },

  async getTransactionReceipt(hash) {
    const cached = sessionStorage.getItem(`dont-ghost-me:receipt:${hash}`)
    if (cached) return JSON.parse(cached) as TransactionReceipt
    const receipt = await getPublic().getTransactionReceipt({ hash: hash as ViemHash })
    return {
      hash,
      status: receipt.status === 'success' ? 'success' : 'failed',
      blockNumber: Number(receipt.blockNumber),
      timestamp: new Date().toISOString(),
      method: 'unknown',
      message: receipt.status === 'success' ? '交易成功' : '交易失败',
    }
  },

  async resetDemo() {
    // Clear browser index + session only. Keep project/bounty meta so nicknames and
    // submission URLs can restore after events re-index. Chain state is unchanged —
    // restart Anvil and redeploy to wipe on-chain data.
    localStorage.removeItem(indexKey())
    localStorage.removeItem(SESSION_KEY)
    writeIndex({ projectIds: [], bountyIds: [] })
    emitUpdate()
  },
}
