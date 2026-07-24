import { create } from 'zustand'
import type {
  Bounty,
  CreateBountyInput,
  CreateProjectInput,
  Hash,
  Project,
  TransactionReceipt,
  WalletAccount,
  WalletConnection,
  WorkSubmission,
} from '../contracts/types'
import { contractService } from '../services/contractService'

type ToastKind = 'success' | 'error' | 'info'
export interface ToastMessage {
  id: number
  kind: ToastKind
  title: string
  description?: string
}

interface AppStore {
  projects: Project[]
  bounties: Bounty[]
  accounts: WalletAccount[]
  wallet: WalletConnection
  isHydrating: boolean
  pendingMethod?: string
  lastReceipt?: TransactionReceipt
  toasts: ToastMessage[]
  hydrate: () => Promise<void>
  connectWallet: (connector?: WalletConnection['connector'], accountId?: string) => Promise<void>
  disconnectWallet: () => Promise<void>
  switchAccount: (accountId: string) => Promise<void>
  createProject: (input: CreateProjectInput) => Promise<TransactionReceipt>
  confirmParticipation: (projectId: string, memberId: string) => Promise<TransactionReceipt>
  lockDeposit: (projectId: string, memberId: string) => Promise<TransactionReceipt>
  quitProject: (projectId: string, memberId: string) => Promise<TransactionReceipt>
  advanceProject: (projectId: string) => Promise<TransactionReceipt>
  completeProject: (projectId: string) => Promise<TransactionReceipt>
  batchResolveBounties: (projectId: string) => Promise<TransactionReceipt>
  createBounty: (input: CreateBountyInput) => Promise<TransactionReceipt>
  claimBounty: (bountyId: string) => Promise<TransactionReceipt>
  cancelBountyClaim: (bountyId: string) => Promise<TransactionReceipt>
  submitWork: (
    bountyId: string,
    submission: Omit<WorkSubmission, 'submittedAt'>,
  ) => Promise<TransactionReceipt>
  requestRevision: (bountyId: string, feedback: string) => Promise<TransactionReceipt>
  approveAndPay: (bountyId: string) => Promise<TransactionReceipt>
  resetDemo: () => Promise<void>
  dismissToast: (id: number) => void
  notify: (kind: ToastKind, title: string, description?: string) => void
}

const methodLabels: Record<string, string> = {
  createProject: '创建共同承诺',
  confirmParticipation: '确认参与',
  lockDeposit: '锁定保证金',
  quitProject: '退出项目',
  advanceProject: '完成当前阶段',
  completeProject: '完成项目并结算',
  batchResolveBounties: '批量完成补救任务',
  createBounty: '发布救场悬赏',
  claimBounty: '领取救场任务',
  cancelBountyClaim: '放弃救场任务',
  submitWork: '提交救场成果',
  requestRevision: '提交修改意见',
  approveAndPay: '验收并支付奖励',
}

export const useAppStore = create<AppStore>((set, get) => {
  const refresh = async () => {
    const [projects, bounties, wallet, accounts] = await Promise.all([
      contractService.getProjects(),
      contractService.getBounties(),
      contractService.getWalletConnection(),
      contractService.getAccounts(),
    ])
    set({ projects, bounties, wallet, accounts, isHydrating: false })
  }

  const run = async (
    method: string,
    action: () => Promise<{ hash: Hash }>,
  ): Promise<TransactionReceipt> => {
    if (!get().wallet.isConnected) throw new Error('请先连接钱包')
    set({ pendingMethod: method })
    try {
      const tx = await action()
      const receipt = await contractService.getTransactionReceipt(tx.hash)
      if (receipt.status === 'failed') throw new Error(receipt.error ?? receipt.message)
      await refresh()
      get().notify('success', methodLabels[method] ?? '交易成功', receipt.message)
      set({ lastReceipt: receipt, pendingMethod: undefined })
      return receipt
    } catch (error) {
      const message = error instanceof Error ? error.message : '交易失败'
      get().notify('error', '交易失败', message)
      set({ pendingMethod: undefined })
      throw error
    }
  }

  return {
    projects: [],
    bounties: [],
    accounts: [],
    wallet: { isConnected: false },
    isHydrating: true,
    toasts: [],
    hydrate: refresh,
    connectWallet: async (connector, accountId) => {
      set({ pendingMethod: 'connectWallet' })
      try {
        await contractService.connectWallet(connector, accountId)
        await refresh()
        get().notify('success', '钱包连接成功', '已连接 Monad 演示网络')
      } finally {
        set({ pendingMethod: undefined })
      }
    },
    disconnectWallet: async () => {
      await contractService.disconnectWallet()
      await refresh()
      get().notify('info', '钱包已断开')
    },
    switchAccount: async (accountId) => {
      await contractService.switchAccount(accountId)
      await refresh()
      const account = get().accounts.find((item) => item.id === accountId)
      get().notify('info', `已切换为 ${account?.name ?? '演示账户'}`)
    },
    createProject: (input) => run('createProject', () => contractService.createProject(input)),
    confirmParticipation: (projectId, memberId) =>
      run('confirmParticipation', () => contractService.confirmParticipation(projectId, memberId)),
    lockDeposit: (projectId, memberId) =>
      run('lockDeposit', () => contractService.lockDeposit(projectId, memberId)),
    quitProject: (projectId, memberId) =>
      run('quitProject', () => contractService.quitProject(projectId, memberId)),
    advanceProject: (projectId) =>
      run('advanceProject', () => contractService.advanceProject(projectId)),
    completeProject: (projectId) =>
      run('completeProject', () => contractService.completeProject(projectId)),
    batchResolveBounties: (projectId) =>
      run('batchResolveBounties', () => contractService.batchResolveBounties(projectId)),
    createBounty: (input) => run('createBounty', () => contractService.createBounty(input)),
    claimBounty: (bountyId) => run('claimBounty', () => contractService.claimBounty(bountyId)),
    cancelBountyClaim: (bountyId) =>
      run('cancelBountyClaim', () => contractService.cancelBountyClaim(bountyId)),
    submitWork: (bountyId, submission) =>
      run('submitWork', () => contractService.submitWork(bountyId, submission)),
    requestRevision: (bountyId, feedback) =>
      run('requestRevision', () => contractService.requestRevision(bountyId, feedback)),
    approveAndPay: (bountyId) =>
      run('approveAndPay', () => contractService.approveAndPay(bountyId)),
    resetDemo: async () => {
      await contractService.resetDemo()
      await refresh()
      get().notify('success', 'Demo 已重置', '现在可以从头演示完整救场流程')
    },
    dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
    notify: (kind, title, description) => {
      const id = Date.now()
      set((state) => ({ toasts: [...state.toasts, { id, kind, title, description }] }))
      window.setTimeout(() => get().dismissToast(id), 3800)
    },
  }
})
