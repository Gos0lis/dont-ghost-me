export type Address = `0x${string}`
export type Hash = `0x${string}`

export type AccountRole = 'initiator' | 'member' | 'rescuer'
/** UI / product project status (may be derived from chain + members/bounties). */
export type ProjectStatus =
  | 'draft'
  | 'awaiting_confirmation'
  | 'active'
  | 'rescue_needed'
  | 'rescue_in_progress'
  | 'active_again'
  | 'completed'
  | 'cancelled'
/** On-chain ProjectStatus enum: Active=0, Finished=1, Cancelled=2 */
export type ChainProjectStatus = 'Active' | 'Finished' | 'Cancelled'
export type MemberStatus = 'invited' | 'confirmed' | 'active' | 'quit' | 'completed'
export type BountyStatus =
  | 'open'
  | 'claimed'
  | 'submitted'
  | 'revision_required'
  | 'approved'
  | 'rejected'
  | 'paid'
  | 'cancelled'
export type TransactionStatus = 'pending' | 'success' | 'failed'

export interface WalletAccount {
  id: string
  name: string
  address: Address
  role: AccountRole
  avatar: string
  balance: number
}

export interface WalletConnection {
  isConnected: boolean
  connector?: 'MetaMask' | 'Rabby' | 'Browser Wallet'
  account?: WalletAccount
}

export interface ProjectMember {
  id: string
  name: string
  address: Address
  role: string
  task: string
  taskDeadline: string
  deposit: number
  depositLocked: boolean
  status: MemberStatus
}

export interface TimelineEvent {
  id: string
  type: 'project' | 'member' | 'warning' | 'bounty' | 'submission' | 'payment'
  title: string
  description: string
  timestamp: string
  txHash?: Hash
}

export interface Project {
  id: string
  name: string
  description: string
  category: string
  goal: string
  creatorAddress: Address
  startDate: string
  deadline: string
  status: ProjectStatus
  progress: number
  totalDeposit: number
  lockedDeposit: number
  rescuePool: number
  reservedBounty: number
  members: ProjectMember[]
  timeline: TimelineEvent[]
}

export interface WorkSubmission {
  githubUrl: string
  demoUrl: string
  summary: string
  testNotes: string
  handoverNotes: string
  submittedAt: string
}

export interface Bounty {
  id: string
  projectId: string
  title: string
  description: string
  skills: string[]
  deliverables: string[]
  acceptanceCriteria: string[]
  deadline: string
  reward: number
  allowMultiple: boolean
  publisherName: string
  publisherAddress: Address
  sourceMemberId: string
  sourceNote: string
  status: BountyStatus
  rescuerId?: string
  rescuerName?: string
  rescuerAddress?: Address
  submission?: WorkSubmission
  revisionFeedback?: string
  paidTxHash?: Hash
}

export interface CreateProjectInput {
  name: string
  description: string
  category: string
  goal: string
  startDate: string
  deadline: string
  members: Omit<ProjectMember, 'id' | 'depositLocked' | 'status'>[]
}

export interface CreateBountyInput {
  projectId: string
  title: string
  description: string
  skills: string[]
  deliverables: string[]
  acceptanceCriteria: string[]
  deadline: string
  reward: number
  allowMultiple: boolean
  sourceMemberId: string
}

export interface TransactionResponse {
  hash: Hash
  status: 'pending'
}

export interface TransactionReceipt {
  hash: Hash
  status: TransactionStatus
  blockNumber?: number
  timestamp: string
  method: string
  from?: Address
  message: string
  error?: string
}

export interface MockChainState {
  version: number
  blockNumber: number
  accounts: WalletAccount[]
  connection: WalletConnection
  projects: Project[]
  bounties: Bounty[]
  receipts: Record<Hash, TransactionReceipt>
}
