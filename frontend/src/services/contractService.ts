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
import { mockContractService } from './mockContractService'

export interface ContractService {
  connectWallet(connector?: WalletConnection['connector'], accountId?: string): Promise<WalletConnection>
  disconnectWallet(): Promise<void>
  switchAccount(accountId: string): Promise<WalletConnection>
  getWalletConnection(): Promise<WalletConnection>
  getAccounts(): Promise<WalletAccount[]>
  createProject(input: CreateProjectInput): Promise<TransactionResponse>
  confirmParticipation(projectId: string, memberId: string): Promise<TransactionResponse>
  lockDeposit(projectId: string, memberId: string): Promise<TransactionResponse>
  quitProject(projectId: string, memberId: string): Promise<TransactionResponse>
  createBounty(input: CreateBountyInput): Promise<TransactionResponse>
  claimBounty(bountyId: string): Promise<TransactionResponse>
  submitWork(bountyId: string, submission: Omit<WorkSubmission, 'submittedAt'>): Promise<TransactionResponse>
  requestRevision(bountyId: string, feedback: string): Promise<TransactionResponse>
  approveAndPay(bountyId: string): Promise<TransactionResponse>
  getProject(projectId: string): Promise<Project | undefined>
  getProjects(): Promise<Project[]>
  getBounty(bountyId: string): Promise<Bounty | undefined>
  getBounties(): Promise<Bounty[]>
  getWalletBalance(address?: Address): Promise<number>
  getTransactionReceipt(hash: Hash): Promise<TransactionReceipt>
  resetDemo(): Promise<void>
}

// Swap only this binding for a future viemContractService implementation.
export const contractService: ContractService = mockContractService
