import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  formatEther,
  http,
  parseEther,
  type Account,
  type EIP1193Provider,
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
  ExpulsionProposal,
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
  getChainMode,
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

/** Anvil default keys — local/dev only. Never used outside `VITE_CHAIN_MODE=local`. */
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
    /** Chain invite: seat waiting for someone else's wallet */
    pendingInvite?: boolean
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

type ChainExpulsionProposal = {
  id: bigint
  projectId: bigint
  target: Address
  proposer: Address
  approveVotes: bigint
  rejectVotes: bigint
  deadline: bigint
  bondAmount: bigint
  executed: boolean
  reason: string
}

function mapExpulsionProposal(raw: ChainExpulsionProposal): ExpulsionProposal {
  return {
    id: String(raw.id),
    projectId: String(raw.projectId),
    target: raw.target,
    proposer: raw.proposer,
    approveVotes: Number(raw.approveVotes),
    rejectVotes: Number(raw.rejectVotes),
    deadline: Number(raw.deadline),
    bondAmount: toDisplayMon(raw.bondAmount),
    executed: raw.executed,
    reason: raw.reason,
  }
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

function isChainMode() {
  return getChainMode() === 'chain'
}

function rpcPollMs() {
  // Anvil mines instantly; public RPCs need gentler polling.
  return isChainMode() ? 1_500 : 50
}

function txWaitTimeoutMs() {
  return isChainMode() ? 180_000 : 15_000
}

function getPublic(): PublicClient {
  if (!publicClient) {
    const chain = getConfiguredChain()
    publicClient = createPublicClient({
      chain,
      transport: http(chain.rpcUrls.default.http[0], { batch: true }),
      pollingInterval: rpcPollMs(),
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

type InjectedEthereum = EIP1193Provider & {
  isMetaMask?: boolean
  isRabby?: boolean
  providers?: InjectedEthereum[]
}

function allInjectedProviders(): InjectedEthereum[] {
  const ethereum = (window as Window & { ethereum?: InjectedEthereum; rabby?: InjectedEthereum }).ethereum
  const rabby = (window as Window & { rabby?: InjectedEthereum }).rabby
  const list: InjectedEthereum[] = []
  if (ethereum?.providers?.length) list.push(...ethereum.providers)
  else if (ethereum) list.push(ethereum)
  if (rabby && !list.includes(rabby)) list.push(rabby)
  return list
}

function injectedProvider(preferred: WalletConnection['connector'] = 'Browser Wallet'): EIP1193Provider {
  const providers = allInjectedProviders()
  if (providers.length === 0) {
    throw new Error('未检测到浏览器钱包。请安装或启用 MetaMask / Rabby 后重试。')
  }
  if (preferred === 'Rabby') {
    const rabby = providers.find((item) => item.isRabby)
    if (!rabby) throw new Error('未检测到 Rabby 钱包，请安装或启用 Rabby 扩展后重试。')
    return rabby
  }
  const metamask = providers.find((item) => item.isMetaMask && !item.isRabby)
  return metamask ?? providers[0]
}

function connectorLabel(provider: InjectedEthereum, preferred?: WalletConnection['connector']): WalletConnection['connector'] {
  if (preferred === 'Rabby' || provider.isRabby) return 'Rabby'
  if (provider.isMetaMask) return 'MetaMask'
  return preferred ?? 'Browser Wallet'
}

function shortAddress(address: Address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

async function walletFor(
  accountId: string,
): Promise<{ account: Account | Address; client: WalletClient; profile: WalletAccount }> {
  const chain = getConfiguredChain()
  if (isChainMode()) {
    const session = readSession()
    if (!session.isConnected || !session.account) throw new Error('请先连接钱包')
    const provider = injectedProvider(session.connector ?? 'Browser Wallet')
    const addresses = (await provider.request({ method: 'eth_accounts' })) as string[]
    const address = addresses[0] as Address | undefined
    if (!address || address.toLowerCase() !== session.account.address.toLowerCase()) {
      throw new Error('钱包账户已变更，请重新连接')
    }
    return {
      account: address,
      client: createWalletClient({ account: address, chain, transport: custom(provider) }),
      profile: session.account,
    }
  }

  if (getChainMode() !== 'local') {
    throw new Error('内置演示账户仅可用于本地 Anvil 联调；公链模式请连接浏览器钱包')
  }

  const profile = accountById(accountId)
  const account = privateKeyToAccount(profile.privateKey)
  const client = createWalletClient({
    account,
    chain,
    transport: http(chain.rpcUrls.default.http[0], { batch: true }),
    pollingInterval: 50,
  })
  return { account, client, profile }
}

function currentAccountId(): string {
  const session = readSession()
  if (!session.isConnected || !session.account) throw new Error('请先连接钱包')
  return session.account.id
}

async function refreshBalance(profile: WalletAccount) {
  const balance = await getPublic().getBalance({ address: profile.address })
  profile.balance = toDisplayMon(balance)
  return profile.balance
}

function formatContractError(error: unknown, fallback = '链上交易失败'): string {
  const err = error as {
    shortMessage?: string
    details?: string
    message?: string
    cause?: { shortMessage?: string; message?: string; reason?: string }
  }
  const text = [
    err?.shortMessage,
    err?.details,
    err?.cause?.shortMessage,
    err?.cause?.reason,
    err?.cause?.message,
    err?.message,
  ]
    .filter(Boolean)
    .join('\n')

  if (/Only project owner/i.test(text)) {
    return '只有承诺创建者可以提交「任务完成」'
  }
  if (/Project is not active/i.test(text)) return '该承诺已结束，无法再次结算'
  if (/reserved bounties/i.test(text)) return '仍有未结清的救场悬赏，请先完成验收'
  if (/User rejected|user denied|rejected the request/i.test(text)) return '已取消钱包签名'
  if (/OnlyActiveMember/i.test(text)) return '只有当前活跃成员可以发起或参与投票'
  if (/InsufficientActiveMembers/i.test(text)) return '至少需要 3 名活跃成员才能发起移除投票'
  if (/TargetHasOpenProposal|ProposerHasOpenProposal/i.test(text)) return '已有一项相关移除投票正在进行'
  if (/ExpulsionVotingActive/i.test(text)) return '投票期尚未结束，暂时不能执行结果'
  if (/ExpulsionVotingEnded/i.test(text)) return '投票已经结束，请执行投票结果'
  if (/ExpulsionAlreadyVoted/i.test(text)) return '当前钱包已经投过票'
  if (/IncorrectExpulsionBond/i.test(text)) return '发起投票所需的提案保证金不正确'

  const reason =
    text.match(/reverted with the following reason:\s*\n?\s*(.+)/i)?.[1]?.trim() ||
    text.match(/execution reverted:\s*(.+)/i)?.[1]?.trim() ||
    text.match(/Error:\s*(.+)$/im)?.[1]?.trim()
  if (reason && reason.length < 100 && !/version:|http|0x/i.test(reason)) {
    return reason.replace(/\.$/, '')
  }
  return fallback
}

async function writeContract(
  method: string,
  accountId: string,
  functionName: string,
  args: readonly unknown[],
  value?: bigint,
): Promise<{ hash: Hash; message: string; receipt: Awaited<ReturnType<PublicClient['waitForTransactionReceipt']>> }> {
  const { client, account, profile } = await walletFor(accountId)
  let hash: Hash
  try {
    hash = (await client.writeContract({
      address: getAddress(),
      abi: dontGhostMeAbi,
      functionName: functionName as never,
      args: args as never,
      account,
      chain: getConfiguredChain(),
      value,
    })) as Hash
  } catch (error) {
    throw new Error(formatContractError(error))
  }
  const receipt = await getPublic().waitForTransactionReceipt({
    hash,
    pollingInterval: rpcPollMs(),
    timeout: txWaitTimeoutMs(),
  })
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
    error: ok ? undefined : formatContractError(new Error(`${functionName} reverted`), '链上交易失败'),
  }
  sessionStorage.setItem(`dont-ghost-me:receipt:${hash}`, JSON.stringify(localReceipt))
  emitUpdate()
  if (!ok) throw new Error(localReceipt.error)
  return { hash: hash as Hash, message, receipt }
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

function deployFromBlock(): bigint {
  const raw = import.meta.env.VITE_DEPLOY_FROM_BLOCK as string | undefined
  if (raw && /^\d+$/.test(raw)) return BigInt(raw)
  return isChainMode() ? 0n : 0n
}

async function syncIndexesFromEvents() {
  try {
    const index = readIndex()
    // Write paths already remember ids. Skip full-history scans on the hot path —
    // those were a major source of “Anvil feels slow” after every button click.
    if (index.projectIds.length > 0 || index.bountyIds.length > 0) return

    const publicC = getPublic()
    const address = getAddress()
    const fromBlock = deployFromBlock()
    const [projectLogs, bountyLogs] = await Promise.all([
      publicC.getContractEvents({
        address,
        abi: dontGhostMeAbi,
        eventName: 'ProjectCreated',
        fromBlock,
        toBlock: 'latest',
      }),
      publicC.getContractEvents({
        address,
        abi: dontGhostMeAbi,
        eventName: 'BountyCreated',
        fromBlock,
        toBlock: 'latest',
      }),
    ])

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

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

function isPlaceholderAddress(address?: string) {
  return !address || address.toLowerCase() === ZERO_ADDRESS.toLowerCase()
}

/** Bind on-chain joined addresses onto local invite seats so creator UI sees teammates. */
async function syncMemberJoins(projectId: string) {
  if (!isChainMode()) return
  try {
    const store = readMetaStore()
    const meta = store.byProjectId[projectId]
    if (!meta?.members?.length) return

    let owner = ''
    try {
      const raw = await getPublic().readContract({
        address: getAddress(),
        abi: dontGhostMeAbi,
        functionName: 'getProject',
        args: [BigInt(projectId)],
      })
      owner = String(raw.owner).toLowerCase()
    } catch {
      owner = ''
    }

    let joined: string[] = []
    try {
      const members = (await getPublic().readContract({
        address: getAddress(),
        abi: dontGhostMeAbi,
        functionName: 'getProjectMembers',
        args: [BigInt(projectId)],
      })) as Address[]
      joined = members.map((address) => address.toLowerCase())
    } catch {
      // Fallback for older deployments without getProjectMembers.
      const logs = await getPublic().getContractEvents({
        address: getAddress(),
        abi: dontGhostMeAbi,
        eventName: 'MemberJoined',
        args: { projectId: BigInt(projectId) },
        fromBlock: deployFromBlock(),
        toBlock: 'latest',
      })
      joined = logs
        .map((log) => (log.args.member as Address | undefined)?.toLowerCase())
        .filter((value): value is string => Boolean(value))
    }

    let changed = false
    const creatorSeat =
      meta.members.find((member) => member.id === 'member-0') ||
      meta.members.find((member) => !isPlaceholderAddress(member.address) && member.address.toLowerCase() === owner) ||
      undefined

    // Repair: never keep the project owner parked on a non-creator invite seat.
    if (owner) {
      for (const member of meta.members) {
        if (member.id === 'member-0' || member === creatorSeat) continue
        if (!isPlaceholderAddress(member.address) && member.address.toLowerCase() === owner) {
          member.address = ZERO_ADDRESS
          member.pendingInvite = true
          changed = true
        }
      }
    }

    const assigned = new Set(
      meta.members
        .filter((member) => !isPlaceholderAddress(member.address) && !member.pendingInvite)
        .map((member) => member.address.toLowerCase()),
    )

    for (const address of joined) {
      if (assigned.has(address)) continue
      const exact = meta.members.find(
        (member) => !isPlaceholderAddress(member.address) && member.address.toLowerCase() === address,
      )
      if (exact) {
        if (exact.pendingInvite) {
          exact.pendingInvite = false
          changed = true
        }
        assigned.add(address)
        continue
      }

      // Owner may only bind to the creator seat — never to teammate invite seats.
      if (owner && address === owner) {
        const seat = creatorSeat ?? meta.members.find((member) => member.id === 'member-0')
        if (seat && (isPlaceholderAddress(seat.address) || seat.address.toLowerCase() === owner)) {
          seat.address = address as Address
          seat.pendingInvite = false
          assigned.add(address)
          changed = true
        }
        continue
      }

      const seat = meta.members.find(
        (member) =>
          (member.pendingInvite || isPlaceholderAddress(member.address)) &&
          member.id !== 'member-0' &&
          member !== creatorSeat,
      )
      if (!seat) continue
      seat.address = address as Address
      seat.pendingInvite = false
      assigned.add(address)
      changed = true
    }

    if (changed) writeMetaStore(store)
  } catch (error) {
    console.warn('[viem] syncMemberJoins failed', error)
  }
}

async function readChainProject(projectId: string): Promise<Project | undefined> {
  await syncMemberJoins(projectId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let raw: any
  try {
    raw = await getPublic().readContract({
      address: getAddress(),
      abi: dontGhostMeAbi,
      functionName: 'getProject',
      args: [BigInt(projectId)],
    })
  } catch {
    // Stale browser index after Anvil restart — skip missing ids.
    return undefined
  }
  if (!raw || raw.owner === '0x0000000000000000000000000000000000000000') return undefined

  const meta = readMetaStore().byProjectId[projectId] ?? {}
  const deposit = toDisplayMon(raw.depositAmount)
  const members: ProjectMember[] = []

  if (meta.members?.length) {
    for (const member of meta.members) {
      let status: ProjectMember['status'] = member.pendingInvite ? 'invited' : 'invited'
      let depositLocked = false
      if (!isPlaceholderAddress(member.address)) {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let raw: any
  try {
    raw = await getPublic().readContract({
      address: getAddress(),
      abi: dontGhostMeAbi,
      functionName: 'getBounty',
      args: [BigInt(bountyId)],
    })
  } catch {
    return undefined
  }
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
  async connectWallet(connector = 'Browser Wallet', accountId = 'caro') {
    if (isChainMode()) {
      const preferred = connector ?? 'Browser Wallet'
      const provider = injectedProvider(preferred) as InjectedEthereum
      const chain = getConfiguredChain()
      const targetChainId = `0x${chain.id.toString(16)}`
      try {
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: targetChainId }] })
      } catch (error) {
        const code = (error as { code?: number }).code
        if (code !== 4902) throw error
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: targetChainId,
              chainName: chain.name,
              nativeCurrency: chain.nativeCurrency,
              rpcUrls: [...chain.rpcUrls.default.http],
              blockExplorerUrls: chain.blockExplorers?.default.url
                ? [chain.blockExplorers.default.url]
                : ['https://testnet.monadvision.com'],
            },
          ],
        })
      }
      const addresses = (await provider.request({ method: 'eth_requestAccounts' })) as string[]
      const address = addresses[0] as Address | undefined
      if (!address) throw new Error('钱包未返回账户')
      const resolvedConnector = connectorLabel(provider, preferred)
      const account: WalletAccount = {
        id: address.toLowerCase(),
        name: shortAddress(address),
        address,
        role: 'initiator',
        avatar: address.slice(2, 4).toUpperCase(),
        balance: 0,
      }
      await refreshBalance(account)
      const connection: WalletConnection = { isConnected: true, connector: resolvedConnector, account }
      writeSession(connection)
      await syncIndexesFromEvents()
      emitUpdate()
      return connection
    }

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
    if (isChainMode()) return this.connectWallet(readSession().connector ?? 'Browser Wallet')
    return this.connectWallet('MetaMask', accountId)
  },

  async getWalletConnection() {
    const session = readSession()
    if (!session.isConnected || !session.account) return { isConnected: false }
    if (isChainMode()) {
      try {
        const provider = injectedProvider(session.connector ?? 'Browser Wallet')
        const addresses = (await provider.request({ method: 'eth_accounts' })) as string[]
        if (!addresses[0] || addresses[0].toLowerCase() !== session.account.address.toLowerCase()) {
          return { isConnected: false }
        }
        await refreshBalance(session.account)
        writeSession(session)
        return session
      } catch {
        return { isConnected: false }
      }
    }
    const profile = LOCAL_DEMO_ACCOUNTS.find((item) => item.id === session.account?.id)
    if (profile) {
      await refreshBalance(profile)
      session.account.balance = profile.balance
      writeSession(session)
    }
    return session
  },

  async getAccounts() {
    if (isChainMode()) {
      const connection = await this.getWalletConnection()
      return connection.account ? [connection.account] : []
    }
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
    if (input.members.length < 1) throw new Error('至少需要一名成员')
    if (!isChainMode() && input.members.length < 2) throw new Error('本地链演示至少需要 2 名成员')
    if (!isChainMode() && input.members.length > LOCAL_DEMO_MEMBER_LIMIT) {
      throw new Error(`本地链演示最多 ${LOCAL_DEMO_MEMBER_LIMIT} 名成员（Anvil 测试账户不足）`)
    }
    const deposit = input.members[0]?.deposit ?? 0
    if (!(deposit > 0)) throw new Error('保证金必须大于 0')

    const accountId = currentAccountId()
    const { hash, receipt } = await writeContract('createProject', accountId, 'createProject', [
      input.name,
      toWei(deposit),
    ])

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
        if (isChainMode()) {
          const isCreatorSeat = index === 0
          return {
            id: `member-${index}`,
            name: member.name,
            address: isCreatorSeat ? member.address : ZERO_ADDRESS,
            role: member.role,
            task: member.task,
            taskDeadline: member.taskDeadline,
            deposit: member.deposit,
            pendingInvite: !isCreatorSeat,
          }
        }
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
    if (!member) throw new Error('成员不存在')

    const project = await getPublic().readContract({
      address: getAddress(),
      abi: dontGhostMeAbi,
      functionName: 'getProject',
      args: [BigInt(projectId)],
    })

    if (isChainMode()) {
      const session = readSession()
      if (!session.account) throw new Error('请先连接钱包')
      const wallet = session.account.address.toLowerCase()

      const occupiedSeat = meta?.members?.find(
        (item) => !isPlaceholderAddress(item.address) && item.address.toLowerCase() === wallet,
      )
      if (occupiedSeat && occupiedSeat.id !== memberId) {
        throw new Error('当前钱包已经加入过这份承诺。请把邀请链接发给其他成员，用他们自己的钱包确认。')
      }

      let alreadyOnChain = false
      try {
        const existing = await getPublic().readContract({
          address: getAddress(),
          abi: dontGhostMeAbi,
          functionName: 'getMember',
          args: [BigInt(projectId), session.account.address],
        })
        alreadyOnChain = Boolean(existing.active)
      } catch {
        alreadyOnChain = false
      }

      if (alreadyOnChain && occupiedSeat?.id !== memberId && !occupiedSeat) {
        throw new Error('当前钱包已经加入过这份承诺。请把邀请链接发给其他成员，用他们自己的钱包确认。')
      }

      member.address = session.account.address
      member.pendingInvite = false
      if (!member.name) member.name = session.account.name
      writeMetaStore(store)

      if (alreadyOnChain) {
        const hash = `0x${'a'.repeat(64)}` as Hash
        sessionStorage.setItem(
          `dont-ghost-me:receipt:${hash}`,
          JSON.stringify({
            hash,
            status: 'success',
            timestamp: new Date().toISOString(),
            method: 'joinProject',
            message: '该钱包已在链上加入，已绑定到当前成员席位',
          } satisfies TransactionReceipt),
        )
        emitUpdate()
        return { hash, status: 'pending' }
      }

      const { hash } = await writeContract(
        'joinProject',
        session.account.id,
        'joinProject',
        [BigInt(projectId)],
        project.depositAmount,
      )
      return { hash, status: 'pending' }
    }

    if (!member.accountId) {
      throw new Error('成员未绑定本地演示账户，无法 joinProject')
    }
    const accountId = member.accountId
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
    const accountId = isChainMode()
      ? currentAccountId()
      : (member?.accountId ?? currentAccountId())
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
    const { hash, receipt } = await writeContract('createBounty', currentAccountId(), 'createBounty', [
      BigInt(input.projectId),
      input.description || input.title,
      toWei(input.reward),
    ])
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
    if (!isChainMode()) {
      const profile = accountById(accountId)
      if (profile.role !== 'rescuer') accountId = 'builder-07'
    }
    const { hash } = await writeContract('claimBounty', accountId, 'claimBounty', [BigInt(bountyId)])
    if (!isChainMode()) await this.connectWallet('MetaMask', accountId)
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
    // Owner-only on chain — local demo switches back from hunter after claim.
    if (!isChainMode()) await this.connectWallet('MetaMask', 'caro')
    const accountId = isChainMode() ? currentAccountId() : 'caro'
    const { hash } = await writeContract('requestRevision', accountId, 'requestRevision', [
      BigInt(bountyId),
      feedback,
    ])
    return { hash, status: 'pending' }
  },

  async approveAndPay(bountyId) {
    if (!isChainMode()) await this.connectWallet('MetaMask', 'caro')
    const accountId = isChainMode() ? currentAccountId() : 'caro'
    const { hash } = await writeContract('approveAndPay', accountId, 'approveWork', [BigInt(bountyId)])
    return { hash, status: 'pending' }
  },

  async proposeExpulsion(projectId, target, reason) {
    const bond = await getPublic().readContract({
      address: getAddress(),
      abi: dontGhostMeAbi,
      functionName: 'getRequiredExpulsionBond',
      args: [BigInt(projectId)],
    })
    const { hash } = await writeContract(
      'proposeExpulsion',
      currentAccountId(),
      'proposeExpulsionWithReason',
      [BigInt(projectId), target, reason],
      bond,
    )
    return { hash, status: 'pending' }
  },

  async voteExpulsion(proposalId, support) {
    const { hash } = await writeContract('voteExpulsion', currentAccountId(), 'voteExpulsion', [
      BigInt(proposalId),
      support,
    ])
    return { hash, status: 'pending' }
  },

  async executeExpulsion(proposalId) {
    const { hash } = await writeContract('executeExpulsion', currentAccountId(), 'executeExpulsion', [
      BigInt(proposalId),
    ])
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

  async getActiveExpulsionProposal(projectId, target) {
    const proposalId = await getPublic().readContract({
      address: getAddress(),
      abi: dontGhostMeAbi,
      functionName: 'getActiveExpulsionProposalByTarget',
      args: [BigInt(projectId), target],
    })
    if (proposalId === 0n) return undefined
    const raw = await getPublic().readContract({
      address: getAddress(),
      abi: dontGhostMeAbi,
      functionName: 'getExpulsionProposal',
      args: [proposalId],
    })
    return mapExpulsionProposal(raw as ChainExpulsionProposal)
  },

  async hasVotedExpulsion(proposalId, voter) {
    const address = voter ?? readSession().account?.address
    if (!address) return false
    return getPublic().readContract({
      address: getAddress(),
      abi: dontGhostMeAbi,
      functionName: 'hasVoted',
      args: [BigInt(proposalId), address],
    })
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
    // Clear browser index, session, and nickname/submission meta so local demo starts clean.
    // Chain state is unchanged — restart Anvil and redeploy to wipe on-chain data.
    localStorage.removeItem(indexKey())
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(metaKey())
    writeIndex({ projectIds: [], bountyIds: [] })
    writeMetaStore({ byProjectId: {}, bountyTitles: {} })
    emitUpdate()
  },

  /** Invitee: ensure project index + pending seat exist before join. */
  async ensureInviteSeat(input: {
    projectId: string
    memberId: string
    name: string
    task: string
    deposit: number
    title: string
    category: string
  }) {
    if (!isChainMode()) throw new Error('邀请席位仅用于公链模式')
    rememberProjectId(input.projectId)

    const raw = await getPublic().readContract({
      address: getAddress(),
      abi: dontGhostMeAbi,
      functionName: 'getProject',
      args: [BigInt(input.projectId)],
    })
    if (!raw || raw.owner === ZERO_ADDRESS) {
      throw new Error(`链上找不到项目 #${input.projectId}`)
    }
    const owner = raw.owner as Address
    const deposit = input.deposit || toDisplayMon(raw.depositAmount)
    const today = new Date().toISOString().slice(0, 10)

    const store = readMetaStore()
    const existing = store.byProjectId[input.projectId]
    const members = existing?.members ? [...existing.members] : []

    // Always keep a creator seat so owner joins are never mapped onto invitee seats.
    let creator = members.find((item) => item.id === 'member-0')
    if (!creator) {
      creator = {
        id: 'member-0',
        name: '发起人',
        address: owner,
        role: '发起人',
        task: '项目发起',
        taskDeadline: today,
        deposit,
        pendingInvite: false,
      }
      members.unshift(creator)
    } else if (isPlaceholderAddress(creator.address)) {
      creator.address = owner
      creator.pendingInvite = false
    }

    const seat = members.find((item) => item.id === input.memberId)
    if (input.memberId === 'member-0') {
      creator.name = input.name || creator.name
      creator.task = input.task || creator.task
      creator.deposit = deposit
    } else if (seat) {
      seat.name = input.name || seat.name
      seat.task = input.task || seat.task
      seat.deposit = deposit || seat.deposit
      // Undo earlier bug: owner address wrongly parked on this invite seat.
      if (seat.address.toLowerCase() === owner.toLowerCase() || isPlaceholderAddress(seat.address)) {
        seat.address = ZERO_ADDRESS
        seat.pendingInvite = true
      }
    } else {
      members.push({
        id: input.memberId,
        name: input.name || '受邀成员',
        address: ZERO_ADDRESS,
        role: input.task || '待分配',
        task: input.task || '待分配任务',
        taskDeadline: today,
        deposit,
        pendingInvite: true,
      })
    }

    store.byProjectId[input.projectId] = {
      description: existing?.description ?? `${input.category} · ${raw.name || '共同承诺'}`,
      category: existing?.category ?? input.category,
      goal: existing?.goal ?? input.task,
      startDate: existing?.startDate,
      deadline: existing?.deadline,
      scene: existing?.scene,
      members,
      timeline: existing?.timeline,
      submissions: existing?.submissions ?? {},
    }
    writeMetaStore(store)
    emitUpdate()
  },
}
