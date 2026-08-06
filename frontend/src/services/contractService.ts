import type {
  Address,
  Bounty,
  CreateBountyInput,
  CreateProjectInput,
  Hash,
  Project,
  TransactionReceipt,
  TransactionResponse,
  WalletAccount,
  WalletConnection,
  WorkSubmission,
} from '../contracts/types'
import { getChainMode } from '../contracts/chainConfig'
import { mockContractService } from './mockContractService'
import { viemContractService } from './viemContractService'

/**
 * Unified backend interface.
 *
 * Method layers (do not mix authority):
 * - Chain writes / reads: createProject, lockDeposit(=joinProject on-chain), quitProject,
 *   createBounty, claimBounty, submitWork, requestRevision, approveAndPay, get*
 * - Off-chain / metadata-ish: confirmParticipation (mock-only semantics; local is no-op),
 *   WorkSubmission URL fields stored in browser meta for local
 * - Demo control: resetDemo (mock rebuilds seed; local clears browser index only)
 */
export interface ContractService {
  // —— Wallet / demo accounts ——
  connectWallet(connector?: WalletConnection['connector'], accountId?: string): Promise<WalletConnection>
  disconnectWallet(): Promise<void>
  switchAccount(accountId: string): Promise<WalletConnection>
  getWalletConnection(): Promise<WalletConnection>
  getAccounts(): Promise<WalletAccount[]>

  // —— Chain project writes ——
  createProject(input: CreateProjectInput): Promise<TransactionResponse>
  /** Mock: mark confirmed. Local/chain: no-op marker only — real join is lockDeposit → joinProject. */
  confirmParticipation(projectId: string, memberId: string): Promise<TransactionResponse>
  /** Mock: lock deposit. Local/chain: joinProject(msg.value). */
  lockDeposit(projectId: string, memberId: string): Promise<TransactionResponse>
  quitProject(projectId: string, memberId: string): Promise<TransactionResponse>
  /** Mock-only milestone helper. */
  advanceProject(projectId: string): Promise<TransactionResponse>
  completeProject(projectId: string): Promise<TransactionResponse>
  /** Mock-only batch helper. */
  batchResolveBounties(projectId: string): Promise<TransactionResponse>

  // —— Chain bounty writes ——
  createBounty(input: CreateBountyInput): Promise<TransactionResponse>
  claimBounty(bountyId: string): Promise<TransactionResponse>
  cancelBountyClaim(bountyId: string): Promise<TransactionResponse>
  submitWork(bountyId: string, submission: Omit<WorkSubmission, 'submittedAt'>): Promise<TransactionResponse>
  requestRevision(bountyId: string, feedback: string): Promise<TransactionResponse>
  approveAndPay(bountyId: string): Promise<TransactionResponse>

  // —— Chain reads ——
  getProject(projectId: string): Promise<Project | undefined>
  getProjects(): Promise<Project[]>
  getBounty(bountyId: string): Promise<Bounty | undefined>
  getBounties(): Promise<Bounty[]>
  getWalletBalance(address?: Address): Promise<number>
  getTransactionReceipt(hash: Hash): Promise<TransactionReceipt>

  // —— Demo control ——
  resetDemo(): Promise<void>
  /** Chain invitee: materialize a pending member seat from a shared link. */
  ensureInviteSeat?(input: {
    projectId: string
    memberId: string
    name: string
    task: string
    deposit: number
    title: string
    category: string
  }): Promise<void>
}

/**
 * Swap backend by VITE_CHAIN_MODE:
 * - mock  (default): localStorage fake chain — product demo
 * - local / chain : viem → DontGhostMe (Anvil today; Monad later via env only)
 *
 * Local demo scope: 2–3 members max (see LOCAL_DEMO_ACCOUNT_LIMIT in viemContractService).
 */
export const contractService: ContractService =
  getChainMode() === 'mock' ? mockContractService : viemContractService

export const isOnChainBackend = getChainMode() !== 'mock'
