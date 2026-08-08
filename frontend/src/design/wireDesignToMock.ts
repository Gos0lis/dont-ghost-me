import type { Bounty, Project } from '../contracts/types'
import {
  workspaceCopy,
  scenePresets,
  rescuePackagePresets,
  type DesignSceneKey,
} from '../data/scenePresets'
import {
  designBackend,
  sceneFromProject,
  scaleRescueSubtasks,
  type DesignSnapshot,
  type RescuePackageMeta,
} from '../services/designBackend'
import { contractService, isOnChainBackend } from '../services/contractService'
import { getNativeSymbol, LOCAL_DEMO_MEMBER_LIMIT, getChainMode, getConfiguredChain, getContractAddress } from '../contracts/chainConfig'

const PENDING_INVITE_KEY = 'dont-ghost-me:pending-invite:v1'

type PendingInvite = {
  projectId: string
  memberId: string
  name: string
  task: string
  deposit: number
  title: string
  category: string
  roster?: Array<{ id: string; name: string; task: string; deposit: number }>
}

const INVITE_QUERY_KEYS = [
  'invite',
  'member',
  'name',
  'task',
  'deposit',
  'title',
  'category',
  'roster',
] as const

function inviteFromSearchParams(params: URLSearchParams): PendingInvite | null {
  if (!params.get('invite') || !params.get('member')) return null
  return {
    projectId: params.get('invite')!,
    memberId: params.get('member')!,
    name: params.get('name') || '受邀成员',
    task: params.get('task') || '待分配任务',
    deposit: Number(params.get('deposit') || 0),
    title: params.get('title') || '共同承诺',
    category: params.get('category') || '链上项目',
    roster: designBackend.decodeInviteRoster(params.get('roster')),
  }
}

function inviteSearchParams(invite: PendingInvite): URLSearchParams {
  const search = new URLSearchParams({
    invite: invite.projectId,
    member: invite.memberId,
    name: invite.name,
    task: invite.task,
    deposit: String(invite.deposit),
    title: invite.title,
    category: invite.category,
  })
  if (invite.roster?.length) {
    search.set('roster', designBackend.encodeInviteRoster(invite.roster))
  }
  return search
}

function readPendingInvite(): PendingInvite | null {
  try {
    const raw = sessionStorage.getItem(PENDING_INVITE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PendingInvite
  } catch {
    return null
  }
}

function writePendingInvite(invite: PendingInvite) {
  sessionStorage.setItem(PENDING_INVITE_KEY, JSON.stringify(invite))
}

function clearPendingInvite() {
  sessionStorage.removeItem(PENDING_INVITE_KEY)
}

const pigeonSettings = [
  { pose: 'up', top: '10%', delay: '0s', duration: '2.62s', size: '96px', scale: 0.82, rotate: '-5deg' },
  { pose: 'down', top: '27%', delay: '0.14s', duration: '2.86s', size: '132px', scale: 1.06, rotate: '2deg' },
  { pose: 'up', top: '68%', delay: '0.2s', duration: '2.7s', size: '110px', scale: 0.93, rotate: '-3deg' },
  { pose: 'down', top: '46%', delay: '0.38s', duration: '2.95s', size: '88px', scale: 0.77, rotate: '4deg' },
  { pose: 'up', top: '82%', delay: '0.44s', duration: '2.58s', size: '122px', scale: 1, rotate: '-4deg' },
  { pose: 'down', top: '5%', delay: '0.64s', duration: '2.9s', size: '82px', scale: 0.7, rotate: '3deg' },
  { pose: 'up', top: '56%', delay: '0.72s', duration: '2.82s', size: '140px', scale: 1.12, rotate: '1deg' },
  { pose: 'down', top: '36%', delay: '0.83s', duration: '2.75s', size: '72px', scale: 0.64, rotate: '-2deg' },
]

function $(selector: string, root: ParentNode = document) {
  return root.querySelector(selector) as HTMLElement | null
}

function unit() {
  return getNativeSymbol()
}

function backendLabel() {
  const mode = getChainMode()
  if (mode === 'chain') return 'Monad 测试网'
  if (mode === 'local') return '本地链'
  return '应用数据'
}

function chainModeLabel(mode: ReturnType<typeof getChainMode>) {
  if (mode === 'chain') return 'Monad Testnet'
  if (mode === 'local') return 'Local Anvil'
  return 'Mock Demo'
}

function statusLabel(status: Bounty['status']) {
  switch (status) {
    case 'open':
      return '待领取'
    case 'claimed':
      return '已领取'
    case 'submitted':
      return '待验收'
    case 'revision_required':
      return '需返修'
    case 'approved':
    case 'paid':
      return '已完成'
    case 'rejected':
      return '已拒绝'
    case 'cancelled':
      return '已取消'
    default:
      return status
  }
}

function syncCurrencyLabels() {
  const symbol = unit()
  document.querySelectorAll('[data-native-symbol]').forEach((node) => {
    node.textContent = symbol
  })
}

function timelineLabels(project: Project): [string, string, string, string] {
  const titles = project.timeline.map((item) => item.title)
  return [
    titles[0] ?? '承诺已创建',
    titles[1] ?? '等待成员确认',
    titles[2] ?? '等待救场进展',
    titles[3] ?? '等待验收与结算',
  ]
}

function shortAddress(address?: string) {
  if (!address) return '—'
  if (address.length < 12) return address
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function isGovernanceActiveMember(member: Project['members'][number]) {
  return member.status === 'active' && member.depositLocked
}

type DemoExpulsionVote = {
  projectId: string
  targetId: string
  targetName: string
  targetAddress: string
  reason: string
  eligibleMembers: number
  votesByAddress: Record<string, 'approve' | 'reject'>
}

/**
 * Bind the V11 design DOM to designBackend.
 * Multi-page routes are driven by React Router via navigate/getPath.
 */
export type DesignWireOptions = {
  navigate: (path: string) => void
  getPath: () => string
}

const PATH_TO_PAGE: Record<string, string> = {
  '/': 'home',
  '/promises': 'promises',
  '/rescue': 'rescue',
  '/pigeon': 'pigeon',
}

export function wireDesignToMock(options?: DesignWireOptions): () => void {
  const navigate =
    options?.navigate ??
    ((path: string) => {
      window.history.pushState({}, '', path)
      window.dispatchEvent(new CustomEvent('dont-ghost-me:route-change', { detail: path }))
    })
  const getPath = options?.getPath ?? (() => window.location.pathname)

  let promiseTab: 'create' | 'active' | 'done' = 'active'
  let rescueTab: 'open' | 'mine' | 'done' | 'review' = 'open'

  const timers = new Set<number>()
  const trackTimeout = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
    return id
  }

  let confirmSyncTimer = 0
  const stopConfirmSyncPolling = () => {
    if (confirmSyncTimer) {
      window.clearInterval(confirmSyncTimer)
      timers.delete(confirmSyncTimer)
      confirmSyncTimer = 0
    }
  }

  let snapshot: DesignSnapshot | null = null
  let busy = false
  let activeRescuePackageId: string | null = null
  let activeGovernanceTargetId: string | null = null
  let demoExpulsionVote: DemoExpulsionVote | null = null
  let toastTimer = 0

  const intro = $('#intro')
  const introBrand = $('#introBrand')
  const flock = $('#flock')
  const app = $('#app')
  const toast = $('#toast')
  const promiseModal = $('#promiseModal')
  const walletConnectModal = $('#walletConnectModal')
  const confirmFlowModal = $('#confirmFlowModal')
  const exitFlowModal = $('#exitFlowModal')
  const rescueFlowModal = $('#rescueFlowModal')
  const governanceModal = $('#governanceModal')
  const ticketList = $('#ticketList')
  const memberList = $('#memberList')
  const confirmMemberList = $('#confirmMemberList')
  const exitMemberOptions = $('#exitMemberOptions')
  const governanceMemberList = $('#governanceMemberList')
  const governanceVoteSlip = $('#governanceVoteSlip')
  const commitmentEmpty = $('#commitmentEmpty')
  const commitmentWorkbench = $('#commitmentWorkbench')
  const rescueEmpty = $('#rescueEmpty')

  if (!intro || !app || !toast || !promiseModal || !ticketList || !memberList) {
    console.error('[design] required DOM nodes missing')
    return () => undefined
  }

  const syncRoute = (pathname = getPath()) => {
    const normalized = PATH_TO_PAGE[pathname] ? pathname : '/'
    const page = PATH_TO_PAGE[normalized]
    document.querySelectorAll<HTMLElement>('.design-page').forEach((el) => {
      const active = el.dataset.page === page
      el.hidden = !active
      el.classList.toggle('is-active', active)
    })
    document.querySelectorAll<HTMLElement>('.nav-link[data-route], .mobile-nav-item[data-route]').forEach((el) => {
      const route = el.getAttribute('data-route') ?? '/'
      el.classList.toggle('is-active', route === normalized)
    })
    if (normalized !== '/') {
      intro.classList.add('is-hidden')
      app.classList.add('is-ready')
      app.setAttribute('aria-hidden', 'false')
    }
    window.scrollTo(0, 0)
  }

  const go = (path: string) => {
    navigate(path)
    const pathname = path.split('?')[0] || '/'
    syncRoute(pathname)
  }

  syncRoute()
  syncCurrencyLabels()

  const showToast = (message: string) => {
    window.clearTimeout(toastTimer)
    toast.textContent = message
    toast.classList.add('is-visible')
    toastTimer = trackTimeout(() => toast.classList.remove('is-visible'), 2300)
  }

  const setBusy = (value: boolean) => {
    busy = value
    document.body.classList.toggle('design-busy', value)
  }

  const run = async (label: string, action: () => Promise<DesignSnapshot>) => {
    if (busy) {
      showToast('上一笔交易还在处理，请稍候…')
      return null
    }
    setBusy(true)
    showToast(`${label}处理中…`)
    try {
      snapshot = await action()
      renderAll()
      return snapshot
    } catch (error) {
      const message =
        error instanceof Error
          ? /RPC Request failed|requests limited|viem@/i.test(error.message)
            ? 'Monad 测试网 RPC 暂时限流或繁忙，请等 1–2 秒再试'
            : error.message
          : '操作失败'
      showToast(`${label}失败：${message}`)
      console.error(error)
      return null
    } finally {
      setBusy(false)
    }
  }

  if (flock) {
    flock.innerHTML = pigeonSettings
      .map(
        (pigeon) => `
      <div class="flying-pigeon" style="--top:${pigeon.top};--delay:${pigeon.delay};--duration:${pigeon.duration};--size:${pigeon.size};--scale:${pigeon.scale};--rotate:${pigeon.rotate}">
        <svg viewBox="0 0 180 112"><use href="#flying-pigeon-${pigeon.pose}"></use></svg>
      </div>`,
      )
      .join('')
  }

  const closeIntro = () => {
    intro.classList.add('is-hidden')
    app.classList.add('is-ready')
    app.setAttribute('aria-hidden', 'false')
  }

  const landingPath = PATH_TO_PAGE[getPath()] ? getPath() : '/'
  if (landingPath !== '/') {
    // Deep links (e.g. invite URL) must skip the intro overlay.
    closeIntro()
  } else {
    trackTimeout(() => introBrand?.classList.add('is-logo-visible'), 2450)
    trackTimeout(() => introBrand?.classList.add('is-copy-visible'), 3250)
    const autoEnter = trackTimeout(closeIntro, 6400)
    ;['#skipIntro', '#enterButton'].forEach((selector) => {
      $(selector)?.addEventListener('click', () => {
        window.clearTimeout(autoEnter)
        timers.delete(autoEnter)
        closeIntro()
      })
    })

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      introBrand?.classList.add('is-logo-visible', 'is-copy-visible')
      window.clearTimeout(autoEnter)
      timers.delete(autoEnter)
      trackTimeout(closeIntro, 900)
    }
  }

  const goTo = (path: string) => {
    go(path)
  }

  document.querySelectorAll<HTMLElement>('[data-route]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault()
      goTo(button.getAttribute('data-route') ?? '/')
    })
  })

  // legacy data-scroll → routes
  document.querySelectorAll<HTMLElement>('[data-scroll]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.scroll
      if (target === 'rescue') goTo('/rescue')
      else if (target === 'commitment') goTo('/promises')
      else if (target === 'profile') goTo('/pigeon')
      else goTo('/')
    })
  })

  const openModal = (modal: HTMLElement | null) => {
    if (!modal) return
    modal.classList.add('is-open')
    modal.setAttribute('aria-hidden', 'false')
    document.body.classList.add('modal-open')
  }

  const closeModal = (modal: HTMLElement | null) => {
    if (!modal) return
    modal.classList.remove('is-open')
    modal.setAttribute('aria-hidden', 'true')
    if (
      !promiseModal.classList.contains('is-open') &&
      !walletConnectModal?.classList.contains('is-open') &&
      !confirmFlowModal?.classList.contains('is-open') &&
      !exitFlowModal?.classList.contains('is-open') &&
      !rescueFlowModal?.classList.contains('is-open') &&
      !governanceModal?.classList.contains('is-open')
    ) {
      document.body.classList.remove('modal-open')
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    if (walletConnectModal?.classList.contains('is-open')) closeModal(walletConnectModal)
    if (promiseModal.classList.contains('is-open')) closeModal(promiseModal)
    if (confirmFlowModal?.classList.contains('is-open')) {
      stopConfirmSyncPolling()
      closeModal(confirmFlowModal)
    }
    if (exitFlowModal?.classList.contains('is-open')) closeModal(exitFlowModal)
    if (rescueFlowModal?.classList.contains('is-open')) closeModal(rescueFlowModal)
    if (governanceModal?.classList.contains('is-open')) closeModal(governanceModal)
  }
  document.addEventListener('keydown', onKeyDown)

  const requestWalletConnect = () => {
    if (getChainMode() === 'chain') {
      openModal(walletConnectModal)
      return
    }
    void (async () => {
      const result = await run('连接钱包', () => designBackend.connectDemoWallet('caro'))
      if (result) showToast(`已连接 · ${result.wallet.account?.name ?? '钱包'}`)
    })()
  }

  const renderWallet = () => {
    const button = $('#walletButton')
    if (!button || !snapshot) return
    const account = snapshot.wallet.account
    if (snapshot.wallet.isConnected && account) {
      button.classList.add('is-connected')
      button.innerHTML = `<span class="wallet-dot" aria-hidden="true"></span>已连接 · ${account.name}`
    } else {
      button.classList.remove('is-connected')
      button.innerHTML = `<span class="wallet-dot" aria-hidden="true"></span>连接钱包`
    }
  }

  const setCommitmentEmpty = (title: string, copy: string, actionLabel: string, action: 'connect' | 'create') => {
    if (commitmentEmpty) commitmentEmpty.hidden = false
    if (commitmentWorkbench) commitmentWorkbench.hidden = true
    const titleNode = $('#commitmentEmptyTitle')
    const copyNode = $('#commitmentEmptyCopy')
    const actionNode = $('#commitmentEmptyAction')
    if (titleNode) titleNode.textContent = title
    if (copyNode) copyNode.textContent = copy
    if (actionNode) {
      actionNode.textContent = actionLabel
      actionNode.dataset.emptyAction = action
    }
  }

  const setRescueEmpty = (title: string, copy: string) => {
    if (rescueEmpty) rescueEmpty.hidden = false
    if (ticketList) {
      ticketList.hidden = true
      ticketList.innerHTML = ''
    }
    const titleNode = $('#rescueEmptyTitle')
    const copyNode = $('#rescueEmptyCopy')
    if (titleNode) titleNode.textContent = title
    if (copyNode) copyNode.textContent = copy
  }

  const renderRescuePackages = (packages: RescuePackageMeta[]) => {
    if (!ticketList) return
    if (packages.length === 0) {
      const emptyCopy =
        rescueTab === 'mine'
          ? '你还没有领取中的救场任务。'
          : rescueTab === 'done'
            ? '还没有已完成的救场任务。'
            : rescueTab === 'review'
              ? '当前没有等待你验收的救场成果。补位者提交后会出现在这里。'
              : '暂无开放的救场任务。成员退出并出票后会出现在这里。'
      setRescueEmpty(
        rescueTab === 'review' ? '暂无待验收任务' : '暂无救场任务',
        emptyCopy,
      )
      return
    }
    if (rescueEmpty) rescueEmpty.hidden = true
    ticketList.hidden = false
    ticketList.innerHTML = packages
      .map((pkg, index) => {
        const bounties = designBackend.getPackageBounties(snapshot!, pkg.id)
        const status = designBackend.getPackageStatus(snapshot!, pkg.id)
        const reward = designBackend.getPackageReward(snapshot!, pkg.id)
        const done = ['paid', 'approved', 'rejected', 'cancelled'].includes(status)
        const badge =
          status === 'open' ? '待领取' : done ? '已完成' : status === 'submitted' ? '待验收' : '进行中'
        const deliverableHint =
          bounties.length > 0
            ? `整包 · ${bounties.length} 项交付 · 不可单独领取`
            : '整包救场任务 · 不可单独领取'
        return `
        <article class="rescue-ticket${done ? ' is-completed' : ''}" data-package-id="${pkg.id}" role="button" tabindex="0">
          <span class="ticket-number">NO. ${String(index + 1).padStart(2, '0')}</span>
          <div class="ticket-copy">
            <small>${pkg.category}</small>
            <strong>${pkg.title}</strong>
            <em>${pkg.summary}</em>
            <span class="ticket-package-hint">${deliverableHint}</span>
          </div>
          <div class="ticket-reward"><b>${reward}</b><span>${unit()}</span></div>
          <span class="ticket-status">${badge}</span>
        </article>`
      })
      .join('')
  }

  const syncRescueBoardCopy = () => {
    const title = $('#rescue .section-heading h2')
    const desc = $('#rescueBoardDescription')
    if (rescueTab === 'open') {
      if (title) title.textContent = '等待领取的救场票'
      if (desc) desc.textContent = '选择一张完整救场票，补上团队留下的缺口。子项只是交付清单，需整包领取。'
    } else if (rescueTab === 'review') {
      if (title) title.textContent = '待我验收的救场票'
      if (desc) desc.textContent = '补位者已提交成果。作为承诺创建者，请验收通过后发放奖励。'
    } else if (rescueTab === 'mine') {
      if (title) title.textContent = '我领取的救场票'
      if (desc) desc.textContent = '你已领取的整包任务：提交成果后等待负责人验收。'
    } else {
      if (title) title.textContent = '已完成的救场票'
      if (desc) desc.textContent = '已验收并结算的完整救场任务。'
    }
  }

  const renderRescueHall = () => {
    if (!snapshot) return
    syncRescueTabs()
    syncRescueBoardCopy()
    renderRescuePackages(designBackend.listRescuePackages(snapshot, rescueTab))
  }

  const renderHomeSummaries = () => {
    if (!snapshot) return
    const promiseBox = $('#homePromiseSummary')
    const rescueBox = $('#homeRescueSummary')
    if (!promiseBox || !rescueBox) return

    if (!snapshot.wallet.isConnected) {
      promiseBox.innerHTML = `<div class="workspace-empty"><p class="workspace-empty-title">连接钱包后查看</p><p class="workspace-empty-copy">首页只展示与你相关的进行中承诺摘要。</p></div>`
      rescueBox.innerHTML = `<div class="workspace-empty"><p class="workspace-empty-title">开放救场任务</p><p class="workspace-empty-copy">可先去救场大厅浏览；领取前需要连接钱包。</p><button class="text-button" data-route="/rescue" type="button">进入救场大厅 →</button></div>`
      promiseBox.querySelectorAll<HTMLElement>('[data-route]').forEach((btn) =>
        btn.addEventListener('click', () => goTo(btn.getAttribute('data-route') ?? '/')),
      )
      rescueBox.querySelectorAll<HTMLElement>('[data-route]').forEach((btn) =>
        btn.addEventListener('click', () => goTo(btn.getAttribute('data-route') ?? '/')),
      )
      return
    }

    const activeProjects = designBackend.listMyProjects(snapshot, 'active').slice(0, 2)
    if (activeProjects.length === 0) {
      promiseBox.innerHTML = `<div class="workspace-empty"><p class="workspace-empty-title">还没有进行中的承诺</p><p class="workspace-empty-copy">去「我的承诺」创建一份，或等待被邀请加入。</p><button class="text-button" data-route="/promises" type="button">前往我的承诺 →</button></div>`
    } else {
      promiseBox.innerHTML = activeProjects
        .map(
          (project) => `
          <button class="profile-commitment-card" type="button" data-route="/promises" data-project-id="${project.id}">
          <span class="profile-commitment-tag">${
            designBackend.listRescuePackagesForProject(snapshot!, project.id).length > 0
              ? '救场中'
              : '进行中'
          }</span>
          <strong>${project.name}</strong>
          <em>${project.category} · ${project.members.length} 人</em>
        </button>`,
        )
        .join('')
    }

    const openPackages = designBackend.listRescuePackages(snapshot, 'open').slice(0, 2)
    if (openPackages.length === 0) {
      rescueBox.innerHTML = `<div class="workspace-empty"><p class="workspace-empty-title">暂无待领取救场</p><p class="workspace-empty-copy">有成员退出并生成救场包后，会显示在这里。</p></div>`
    } else {
      rescueBox.innerHTML = openPackages
        .map((pkg) => {
          const reward = designBackend.getPackageReward(snapshot!, pkg.id)
          return `
          <button class="profile-rescue-card" type="button" data-route="/rescue" data-package-id="${pkg.id}">
            <strong>${pkg.title}</strong>
            <em>${pkg.category} · ${reward} ${unit()}</em>
            <small>待领取</small>
          </button>`
        })
        .join('')
    }

    ;[promiseBox, rescueBox].forEach((box) => {
      box.querySelectorAll<HTMLElement>('[data-route]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const projectId = btn.dataset.projectId
          if (projectId) {
            void run('切换承诺', () => designBackend.setActiveProject(projectId)).then(() => {
              promiseTab = 'active'
              goTo(btn.getAttribute('data-route') ?? '/promises')
              syncPromiseTabs()
            })
            return
          }
          goTo(btn.getAttribute('data-route') ?? '/')
        })
      })
    })
  }

  const syncPromiseTabs = () => {
    document.querySelectorAll<HTMLElement>('[data-promise-tab]').forEach((tab) => {
      const active = tab.dataset.promiseTab === promiseTab
      tab.classList.toggle('is-active', active)
      tab.setAttribute('aria-selected', String(active))
    })
    document.querySelectorAll<HTMLElement>('[data-promise-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.promisePanel !== promiseTab
    })
  }

  const syncRescueTabs = () => {
    document.querySelectorAll<HTMLElement>('[data-rescue-tab]').forEach((tab) => {
      const active = tab.dataset.rescueTab === rescueTab
      tab.classList.toggle('is-active', active)
      tab.setAttribute('aria-selected', String(active))
    })
  }

  const renderPromiseLists = () => {
    if (!snapshot) return
    const activeList = $('#activePromiseList')
    const doneList = $('#donePromiseList')
    const activeProjects = designBackend.listMyProjects(snapshot, 'active')
    const doneProjects = designBackend.listMyProjects(snapshot, 'done')

    if (activeList) {
      if (!snapshot.wallet.isConnected) {
        activeList.innerHTML = ''
      } else if (activeProjects.length === 0) {
        activeList.innerHTML = `<p class="profile-list-empty">没有进行中的承诺。可切换到「创建新的承诺」。</p>`
      } else {
        activeList.innerHTML = activeProjects
          .map((project) => {
            const selected = project.id === snapshot!.activeProjectId
            return `
            <button class="profile-commitment-card${selected ? ' is-selected' : ''}" type="button" data-project-id="${project.id}">
              <span class="profile-commitment-tag">${selected ? '当前查看' : '进行中'}</span>
              <strong>${project.name}</strong>
              <em>${project.category} · ${project.members.length} 人 · 池 ${project.rescuePool} ${unit()}</em>
            </button>`
          })
          .join('')
        activeList.querySelectorAll<HTMLElement>('[data-project-id]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const id = btn.dataset.projectId
            if (!id) return
            void run('切换承诺', () => designBackend.setActiveProject(id))
          })
        })
      }
    }

    if (doneList) {
      if (!snapshot.wallet.isConnected) {
        doneList.innerHTML = `<p class="profile-list-empty">请先连接钱包。</p>`
      } else if (doneProjects.length === 0) {
        doneList.innerHTML = `<p class="profile-list-empty">还没有已完成的承诺。</p>`
      } else {
        doneList.innerHTML = doneProjects
          .map(
            (project) => `
          <div class="profile-commitment-card">
            <span class="profile-commitment-tag">${project.status === 'cancelled' ? '已取消' : '已完成'}</span>
            <strong>${project.name}</strong>
            <em>${project.category} · ${project.members.length} 人</em>
          </div>`,
          )
          .join('')
      }
    }
  }

  const renderGovernance = (project: Project) => {
    if (!governanceMemberList || !governanceVoteSlip || !snapshot) return

    const walletAddress = snapshot.wallet.account?.address
    const isCreator = addressesMatch(walletAddress, project.creatorAddress)
    const activeMembers = project.members.filter(isGovernanceActiveMember)
    const chainVote = snapshot.governance?.projectId === project.id ? snapshot.governance : null
    const demoVote = demoExpulsionVote?.projectId === project.id ? demoExpulsionVote : null
    const hasOpenVote = Boolean(chainVote || demoVote)
    const canOpenProposal =
      isCreator &&
      designBackend.isActiveProjectStatus(project.status) &&
      activeMembers.length >= 3 &&
      !hasOpenVote
    const boardDescription = $('#governanceBoardDescription')
    if (boardDescription) {
      boardDescription.textContent =
        activeMembers.length < 3
          ? `当前仅 ${activeMembers.length} 名成员完成确认并锁定保证金；至少需要 3 名活跃成员才能发起投票。`
          : hasOpenVote
            ? '已有一项移除投票进行中，结束前不能重复发起。'
            : isCreator
              ? '有人长期不履约时，由你发起投票，其他成员共同决定是否移除。'
              : '有人长期不履约时，由创建者发起投票；其他成员（除目标外）可同意或反对。'
    }

    governanceMemberList.innerHTML = project.members
      .map((member) => {
        const isOwner = addressesMatch(member.address, project.creatorAddress)
        const isSelf = addressesMatch(member.address, walletAddress)
        const isActive = isGovernanceActiveMember(member)
        const canTarget = isActive && !isOwner && !isSelf && canOpenProposal
        const avatar = escapeHtml(member.name.trim().slice(0, 1).toUpperCase() || '·')
        const status =
          member.status === 'quit'
            ? '已退出'
            : member.status === 'completed'
              ? '已完成'
              : member.depositLocked || member.status === 'active'
                ? '履约中'
                : '待确认'
        const action = canTarget
          ? `<button class="governance-member-action" type="button" data-governance-target="${escapeHtml(member.id)}">发起移除投票</button>`
          : `<em class="governance-member-state${isOwner ? ' is-owner' : ''}">${isOwner ? '发起人' : isSelf ? '我' : status}</em>`
        return `
          <article class="governance-member-card${member.status === 'quit' ? ' is-inactive' : ''}">
            <i class="governance-member-avatar" aria-hidden="true">${avatar}</i>
            <span class="governance-member-copy">
              <strong>${escapeHtml(member.name)}</strong>
              <small>${escapeHtml(member.task || member.role)}</small>
            </span>
            ${action}
          </article>`
      })
      .join('')

    const vote = chainVote ?? demoVote
    governanceVoteSlip.hidden = !vote
    if (!vote) return

    const setVoteText = (selector: string, value: string) => {
      const node = $(selector)
      if (node) node.textContent = value
    }
    setVoteText('#governanceVoteTarget', vote.targetName)
    setVoteText('#governanceVoteReason', `“${vote.reason}”`)
    const votes = demoVote ? Object.values(demoVote.votesByAddress) : []
    const approveVotes = chainVote
      ? chainVote.approveVotes
      : votes.filter((item) => item === 'approve').length
    const rejectVotes = chainVote
      ? chainVote.rejectVotes
      : votes.filter((item) => item === 'reject').length
    const currentVote = chainVote
      ? chainVote.hasCurrentWalletVoted
        ? 'submitted'
        : undefined
      : walletAddress && demoVote
        ? demoVote.votesByAddress[walletAddress.toLowerCase()]
        : undefined
    const isVoteTarget = chainVote
      ? addressesMatch(walletAddress, chainVote.targetAddress)
      : demoVote
        ? addressesMatch(walletAddress, demoVote.targetAddress)
        : false
    const canCastVote =
      Boolean(walletAddress) &&
      !currentVote &&
      !isVoteTarget &&
      Boolean(
        project.members.some(
          (member) =>
            addressesMatch(member.address, walletAddress) && isGovernanceActiveMember(member),
        ),
      )
    const passed = approveVotes > vote.eligibleMembers / 2
    setVoteText('#governanceApproveCount', String(approveVotes))
    setVoteText('#governanceRejectCount', String(rejectVotes))

    const castVotes = approveVotes + rejectVotes
    const progress = $('#governanceVoteProgress') as HTMLElement | null
    if (progress) progress.style.width = `${Math.min(100, (castVotes / vote.eligibleMembers) * 100)}%`

    const hint = $('#governanceVoteHint')
    if (hint) {
      hint.textContent = passed
        ? chainVote && Date.now() < chainVote.deadline * 1000
          ? `已获得 ${approveVotes}/${vote.eligibleMembers} 票同意，达到严格过半；需等到 ${new Date(chainVote.deadline * 1000).toLocaleString('zh-CN')} 后执行。`
          : `已获得 ${approveVotes}/${vote.eligibleMembers} 票同意，达到严格过半，可以执行移除。`
        : isVoteTarget
          ? '你是本次投票的目标成员，不能参与表决。'
          : currentVote
            ? chainVote
              ? `你已经投过票。投票将于 ${new Date(chainVote.deadline * 1000).toLocaleString('zh-CN')} 截止。`
              : `你已投${currentVote === 'approve' ? '同意' : '反对'}票，可切换演示账户继续测试。`
            : chainVote
              ? `除目标成员外，每位活跃成员一票；无需提案保证金，截止后才能执行结果。`
              : '除目标成员外，每位活跃成员一票；Mock 可点击右上角钱包切换成员。'
    }
    governanceVoteSlip.querySelectorAll<HTMLButtonElement>('[data-governance-vote]').forEach((button) => {
      button.disabled = !canCastVote
    })
    const execute = $('#governanceExecute') as HTMLButtonElement | null
    if (execute) {
      const votingEnded = chainVote ? Date.now() >= chainVote.deadline * 1000 : passed
      const isOwner = addressesMatch(walletAddress, project.creatorAddress)
      execute.hidden = chainVote ? !votingEnded : !passed
      execute.disabled = chainVote ? !isOwner : false
      execute.textContent = chainVote
        ? !isOwner
          ? '请由承诺发起人执行结果'
          : passed
            ? '执行移除并发布救场任务'
            : '结算未通过的投票'
        : '执行移除结果'
    }
  }

  const renderWorkspace = () => {
    if (!snapshot) return
    renderWallet()
    syncPromiseTabs()
    renderPromiseLists()

    const connected = snapshot.wallet.isConnected
    const governanceDemoLoader = $('#governanceDemoLoader') as HTMLButtonElement | null
    if (governanceDemoLoader) governanceDemoLoader.hidden = getChainMode() !== 'mock'
    const commitment = $('#commitment')
    if (commitment) commitment.dataset.scene = snapshot.activeScene

    const setText = (selector: string, value: string) => {
      const node = $(selector)
      if (node) node.textContent = value
    }

    const copy = workspaceCopy[snapshot.activeScene]
    setText('#workspaceEyebrow', copy.eyebrow)
    setText('#workspaceDescription', '创建新的承诺，或管理进行中与已完成的共同计划。')
    setText('#rescueBoardEyebrow', copy.rescueEyebrow)
    setText('#rescueBoardDescription', '浏览已发布的完整救场任务。子项只是交付清单，需整包领取。')

    if (!connected) {
      setCommitmentEmpty('请先连接钱包', '连接后将显示由你发起或参与的承诺，不会展示无关案例。', '连接钱包', 'connect')
      if (promiseTab === 'active') {
        /* empty visible */
      }
      return
    }

    const activeProjects = designBackend.listMyProjects(snapshot, 'active')
    const project = designBackend.resolveWorkbenchProject(snapshot)
    if (activeProjects.length === 0 || !project) {
      setCommitmentEmpty('还没有进行中的承诺', '创建一份承诺后，相关成员与保证金会出现在这里。', '创建一份承诺', 'create')
      return
    }

    if (commitmentEmpty) commitmentEmpty.hidden = true
    if (commitmentWorkbench) commitmentWorkbench.hidden = false

    setText('#projectSceneLabel', copy.label)
    setText('#projectCardTitle', project.name)
    setText('#projectSummary', project.description)
    setText('#projectMemberCount', `${project.members.length} 人`)
    setText('#projectDeposit', `${project.members[0]?.deposit ?? 0} ${unit()}`)
    renderGovernance(project)

    const live = snapshot
    const projectPackages = designBackend.listRescuePackagesForProject(live, project.id)
    const rescueStatuses = projectPackages.map((pkg) => designBackend.getPackageStatus(live, pkg.id))
    const hasPublishedRescue = projectPackages.length > 0
    const allRescueSettled =
      hasPublishedRescue &&
      rescueStatuses.every((status) => ['paid', 'approved', 'rejected', 'cancelled'].includes(status))
    const rescueInFlight = hasPublishedRescue && !allRescueSettled
    const pendingReview = designBackend.listPackagesAwaitingCreatorReview(live, project.id)
    const walletAddress = snapshot.wallet.account?.address
    const isCreator =
      getChainMode() === 'mock' ||
      Boolean(walletAddress && addressesMatch(project.creatorAddress, walletAddress))
    const awaitingReview = pendingReview.length > 0

    setText(
      '#projectStage',
      project.status === 'awaiting_confirmation'
        ? '等待确认'
        : project.status === 'completed'
          ? '已完成'
          : awaitingReview
            ? '救场待验收'
            : rescueInFlight
              ? '救场进行中'
              : allRescueSettled
                ? '救场已结算 · 待任务完成'
                : project.category,
    )
    const [t1, t2, t3, t4] = timelineLabels(project)
    setText('#timelineOne', t1)
    setText('#timelineTwo', t2)
    setText('#timelineThree', t3)
    setText('#timelineFour', t4)
    syncTimelineClasses(project)

    const stamp = $('#projectStatusStamp')
    if (stamp) {
      // Only while a published rescue package is still in flight — hide once 救场已完成.
      stamp.hidden = !rescueInFlight
      const stampSmall = stamp.querySelector('small')
      const stampStrong = stamp.querySelector('strong')
      if (stampSmall) stampSmall.textContent = awaitingReview ? 'REVIEW' : 'RESCUE!'
      if (stampStrong) stampStrong.textContent = awaitingReview ? '待验收' : '救场中'
    }

    setText('#fundAmount', String(project.rescuePool))
    const fundDescription = $('#fundDescription')
    if (fundDescription) {
      fundDescription.innerHTML = awaitingReview
        ? `补位者已提交成果<br />请点击「验收救场」审核发放`
        : rescueInFlight
          ? `救场悬赏进行中<br />验收后发放给补位者`
          : allRescueSettled
            ? `救场已结算完成<br />可点击「任务完成」结束承诺`
            : project.rescuePool > 0
              ? `退出成员的保证金<br />已进入救场池`
              : `当前救场池为空<br />退出后保证金将转入此处`
    }

    const exitBtn = $('#openExitFlow') as HTMLButtonElement | null
    if (exitBtn) {
      const canExit =
        designBackend.allMembersJoined(project) && designBackend.isActiveProjectStatus(project.status)
      exitBtn.disabled = !canExit
      exitBtn.title = canExit
        ? '申请自己退出（保证金自动进入救场悬赏）'
        : '请先完成全部成员确认并锁定保证金'
      exitBtn.classList.toggle('is-disabled', !canExit)
    }

    const reviewBtn = $('#openRescueReview') as HTMLButtonElement | null
    if (reviewBtn) {
      const showReview = isCreator && awaitingReview
      reviewBtn.hidden = !showReview
      reviewBtn.disabled = !showReview
      reviewBtn.classList.toggle('is-disabled', !showReview)
      reviewBtn.title = showReview ? '打开救场成果验收并支付奖励' : ''
    }

    const viewRescueBtn = $('#viewProjectRescue') as HTMLButtonElement | null
    if (viewRescueBtn) {
      viewRescueBtn.textContent = awaitingReview && isCreator ? '去验收大厅 →' : '查看救场任务 →'
    }

    const completeBtn = $('#openCompleteFlow') as HTMLButtonElement | null
    if (completeBtn) {
      const joined = designBackend.allMembersJoined(project)
      const reservedBlocked = project.reservedBounty > 0
      const flowReady =
        designBackend.isActiveProjectStatus(project.status) &&
        joined &&
        !reservedBlocked &&
        !rescueInFlight
      // Keep clickable when only creator-check fails, so the toast can explain why.
      completeBtn.disabled = !flowReady
      completeBtn.classList.toggle('is-disabled', !flowReady || !isCreator)
      completeBtn.title = !designBackend.isActiveProjectStatus(project.status)
        ? '该承诺已结算完成'
        : !joined
          ? '请先完成全部成员确认并锁定保证金'
          : awaitingReview
            ? '请先点击「验收救场」完成验收支付'
            : rescueInFlight || reservedBlocked
              ? '请先在救场大厅完成验收结算，进度与时间线第 3 步对齐后再点任务完成'
              : !isCreator
                ? '只有承诺创建者可以提交「任务完成」'
                : allRescueSettled
                  ? '救场已完成 · 点击结束承诺并解锁保证金'
                  : '全员履约完成，结束承诺并解锁保证金退回'
    }
  }

  const renderAll = () => {
    renderHomeSummaries()
    renderWorkspace()
    renderRescueHall()
    renderProfile()
    syncRoute()
  }

  const openGovernanceProposal = (memberId: string) => {
    if (!snapshot) return
    const project = designBackend.getActiveProject(snapshot)
    const target = project?.members.find((member) => member.id === memberId)
    if (!project || !target) return

    activeGovernanceTargetId = memberId
    const avatar = target.name.trim().slice(0, 1).toUpperCase() || '·'
    const deposit = target.deposit || project.members[0]?.deposit || 0
    const values: Record<string, string> = {
      '#governanceTargetAvatar': avatar,
      '#governanceTargetName': target.name,
      '#governanceTargetTask': target.task || target.role,
      '#governanceTargetDeposit': `${deposit} ${unit()}`,
    }
    Object.entries(values).forEach(([selector, value]) => {
      const node = $(selector)
      if (node) node.textContent = value
    })
    const reason = $('#governanceReason') as HTMLTextAreaElement | null
    if (reason) reason.value = ''
    openModal(governanceModal)
    trackTimeout(() => reason?.focus(), 180)
  }

  governanceMemberList?.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest(
      '[data-governance-target]',
    ) as HTMLButtonElement | null
    if (!button?.dataset.governanceTarget) return
    openGovernanceProposal(button.dataset.governanceTarget)
  })

  ;['#governanceBackdrop', '#governanceClose', '#governanceCancel'].forEach((selector) => {
    $(selector)?.addEventListener('click', () => closeModal(governanceModal))
  })

  $('#governanceSubmit')?.addEventListener('click', () => {
    if (!snapshot || !activeGovernanceTargetId) return
    const project = designBackend.getActiveProject(snapshot)
    const target = project?.members.find((member) => member.id === activeGovernanceTargetId)
    const reasonField = $('#governanceReason') as HTMLTextAreaElement | null
    const reason = reasonField?.value.trim() ?? ''
    if (!project || !target) return
    if (!addressesMatch(snapshot.wallet.account?.address, project.creatorAddress)) {
      showToast('只有承诺创建者可以发起移除投票')
      closeModal(governanceModal)
      renderGovernance(project)
      return
    }
    if (!isGovernanceActiveMember(target)) {
      showToast('该成员尚未完成确认并锁定保证金，不能发起移除投票')
      closeModal(governanceModal)
      renderGovernance(project)
      return
    }
    if (reason.length < 6) {
      showToast('请写明可核实的履约事实，至少 6 个字')
      reasonField?.focus()
      return
    }

    if (getChainMode() !== 'mock') {
      closeModal(governanceModal)
      void run('发起移除投票', () =>
        designBackend.proposeExpulsion(project.id, target.id, reason),
      ).then((result) => {
        if (!result) return
        activeGovernanceTargetId = null
        showToast(`已发起关于 ${target.name} 的链上移除投票`)
      })
      return
    }

    const eligibleMembers = project.members.filter(isGovernanceActiveMember).length
    demoExpulsionVote = {
      projectId: project.id,
      targetId: target.id,
      targetName: target.name,
      targetAddress: target.address,
      reason,
      eligibleMembers: Math.max(eligibleMembers, 1),
      votesByAddress: {},
    }
    closeModal(governanceModal)
    renderGovernance(project)
    showToast(`已发起关于 ${target.name} 的移除投票 · 展示状态未上链`)
  })

  governanceVoteSlip?.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest(
      '[data-governance-vote]',
    ) as HTMLButtonElement | null
    if (!button || !snapshot?.wallet.account?.address) return
    const support = button.dataset.governanceVote === 'approve'
    if (getChainMode() !== 'mock') {
      const proposal = snapshot.governance
      if (!proposal || proposal.hasCurrentWalletVoted) return
      if (addressesMatch(snapshot.wallet.account.address, proposal.targetAddress)) {
        showToast('被提议移除的成员不能参与本次投票')
        return
      }
      void run(support ? '投同意票' : '投反对票', () =>
        designBackend.voteExpulsion(proposal.proposalId, support),
      ).then((result) => {
        if (result) showToast(support ? '同意票已上链' : '反对票已上链')
      })
      return
    }
    if (!demoExpulsionVote) return
    const voterAddress = snapshot.wallet.account.address.toLowerCase()
    if (demoExpulsionVote.votesByAddress[voterAddress]) return
    if (addressesMatch(snapshot.wallet.account.address, demoExpulsionVote.targetAddress)) {
      showToast('被提议移除的成员不能参与本次投票')
      return
    }
    const project = designBackend.getActiveProject(snapshot)
    const isActiveMember = project?.members.some(
      (member) =>
        addressesMatch(member.address, snapshot?.wallet.account?.address) &&
        isGovernanceActiveMember(member),
    )
    if (!isActiveMember) {
      showToast('当前演示账户不是该承诺的活跃成员，不能投票')
      return
    }
    const vote = button.dataset.governanceVote === 'approve' ? 'approve' : 'reject'
    demoExpulsionVote.votesByAddress[voterAddress] = vote
    if (project) renderGovernance(project)
    showToast(vote === 'approve' ? '已投同意移除 · 展示状态未上链' : '已投不同意移除 · 展示状态未上链')
  })

  $('#governanceDemoLoader')?.addEventListener('click', () => {
    demoExpulsionVote = null
    activeGovernanceTargetId = null
    void run('载入投票演示', () => designBackend.loadGovernanceDemo()).then((result) => {
      if (!result) return
      promiseTab = 'active'
      renderWorkspace()
      showToast('三人投票演示已就绪 · Caro / Builder 07 / Yunn 可轮流投票')
    })
  })

  $('#governanceExecute')?.addEventListener('click', () => {
    if (getChainMode() !== 'mock') {
      const vote = snapshot?.governance
      const project = snapshot ? designBackend.getActiveProject(snapshot) : undefined
      if (!vote || !project) return
      const passed = vote.approveVotes > vote.eligibleMembers / 2
      if (Date.now() < vote.deadline * 1000) {
        showToast('投票期尚未结束')
        return
      }
      if (!addressesMatch(snapshot?.wallet.account?.address, project.creatorAddress)) {
        showToast('请切换到承诺发起人的钱包执行结果')
        return
      }
      void (async () => {
        const executed = await run('执行投票结果', () =>
          designBackend.executeExpulsion(vote.proposalId),
        )
        if (!executed) return
        if (!passed) {
          showToast('投票未通过，结果已结算')
          return
        }
        showToast(`${vote.targetName} 已被移除 · 保证金已自动发布为救场悬赏`)
      })()
      return
    }
    if (!demoExpulsionVote || !snapshot) return
    const vote = demoExpulsionVote
    const project = designBackend.getActiveProject(snapshot)
    const target = project?.members.find((member) => member.id === vote.targetId)
    if (!project || !target || !isGovernanceActiveMember(target)) {
      demoExpulsionVote = null
      if (project) renderGovernance(project)
      showToast('这项投票已失效：目标成员不是当前活跃成员，请重新发起')
      return
    }
    const approveVotes = Object.values(vote.votesByAddress).filter((item) => item === 'approve').length
    if (approveVotes <= vote.eligibleMembers / 2) {
      showToast('同意票还没有严格过半')
      return
    }
    void (async () => {
      const removed = await run('执行移除', () =>
        designBackend.executeMockExpulsion(vote.projectId, vote.targetId),
      )
      if (!removed) return

      const removedProject = removed.projects.find((item) => item.id === vote.projectId)
      const scene = removedProject ? sceneFromProject(removedProject) : removed.activeScene
      const published = await run('发布遗留救场任务', () =>
        designBackend.spawnTicketsForRemovedMember(vote.projectId, vote.targetId, scene),
      )
      if (!published) {
        showToast(`${vote.targetName} 已移除，但救场出票失败；可重新载入 Mock 场景后再试`)
        return
      }

      demoExpulsionVote = null
      activeGovernanceTargetId = null
      renderWorkspace()
      showToast(`${vote.targetName} 已被移除 · 救场任务已发布到大厅`)
    })()
  })

  const syncTimelineClasses = (project: Project) => {
    const signed = project.members.filter((m) => m.depositLocked || m.status === 'active').length
    const quitCount = project.members.filter((m) => m.status === 'quit').length
    const allJoined = signed >= project.members.length && project.members.length > 0
    const packages = snapshot ? designBackend.listRescuePackagesForProject(snapshot, project.id) : []
    const statuses = packages.map((pkg) => designBackend.getPackageStatus(snapshot!, pkg.id))
    const hasRescue = packages.length > 0
    const allRescueDone =
      hasRescue &&
      statuses.every((status) => ['paid', 'approved', 'rejected', 'cancelled'].includes(status))
    const rescueActive = hasRescue && !allRescueDone
    const projectDone = project.status === 'completed' || project.status === 'cancelled'

    const one = $('#openConfirmFlow')
    const two = $('#timelineTwoItem')
    const three = $('#timelineThreeItem')
    const four = $('#timelineFourItem')
    const twoLabel = $('#timelineTwo')
    const threeLabel = $('#timelineThree')
    const fourLabel = $('#timelineFour')
    ;[one, two, three, four].forEach((node) => {
      node?.classList.remove('is-done', 'is-alert', 'is-current')
    })

    // 01 confirm
    if (allJoined || projectDone) {
      one?.classList.add('is-done')
    } else {
      one?.classList.add('is-current')
    }

    // 02 progress / quit
    if (quitCount > 0) {
      two?.classList.add(allRescueDone || projectDone ? 'is-done' : 'is-alert')
      if (twoLabel) twoLabel.textContent = `${quitCount} 人退出`
    } else if (allJoined || projectDone) {
      two?.classList.add(rescueActive || allRescueDone || projectDone ? 'is-done' : 'is-current')
      if (twoLabel) twoLabel.textContent = projectDone ? '履约结束' : '履约进行中'
    } else if (twoLabel) {
      twoLabel.textContent = '等待进展'
    }

    // 03 rescue — aligned with 救场大厅 package status
    if (!hasRescue) {
      if (allJoined && quitCount === 0) {
        three?.classList.add(projectDone ? 'is-done' : 'is-done')
        if (threeLabel) threeLabel.textContent = '无需救场'
      } else if (threeLabel) {
        threeLabel.textContent = '等待救场'
      }
    } else if (allRescueDone) {
      three?.classList.add('is-done')
      if (threeLabel) threeLabel.textContent = '救场已结算'
    } else {
      three?.classList.add('is-current')
      const lead = statuses[0]
      if (threeLabel) {
        threeLabel.textContent =
          lead === 'open'
            ? '救场票待领取'
            : lead === 'submitted'
              ? '救场待验收'
              : lead === 'revision_required'
                ? '救场需返修'
                : '救场进行中'
      }
    }

    // 04 promise settlement — aligned with「任务完成」
    if (projectDone) {
      four?.classList.add('is-done')
      if (fourLabel) fourLabel.textContent = '承诺已结算'
    } else if (allJoined && !rescueActive && (allRescueDone || quitCount === 0)) {
      four?.classList.add('is-current')
      if (fourLabel) {
        fourLabel.textContent = allRescueDone ? '救场完成 · 待任务完成' : '可任务完成结算'
      }
    } else if (fourLabel) {
      fourLabel.textContent = '等待验收与结算'
    }
  }

  const renderProfile = () => {
    if (!snapshot) return
    const empty = $('#profileEmpty')
    const board = $('#profileBoard')
    const connected = snapshot.wallet.isConnected && snapshot.wallet.account

    if (!connected) {
      if (empty) empty.hidden = false
      if (board) board.hidden = true
      return
    }

    if (empty) empty.hidden = true
    if (board) board.hidden = false

    const account = snapshot.wallet.account!
    const setText = (selector: string, value: string) => {
      const node = $(selector)
      if (node) node.textContent = value
    }

    setText('#profileName', account.name)
    setText(
      '#profileRole',
      account.role === 'initiator' ? '发起人 · 负责人' : account.role === 'rescuer' ? '救场者' : '承诺成员',
    )
    setText('#profileAddress', account.address)
    setText('#profileBalance', String(account.balance ?? 0))

    const mode = getChainMode()
    const chain = getConfiguredChain()
    setText('#profileChainMode', chainModeLabel(mode))
    setText('#profileChainName', chain.name)
    setText('#profileChainId', String(chain.id))
    setText('#profileNativeSymbol', unit())

    const contractNode = $('#profileContract')
    if (contractNode) {
      if (mode === 'mock') {
        contractNode.textContent = 'mock · 无链上合约'
      } else {
        try {
          contractNode.textContent = shortAddress(getContractAddress())
          contractNode.setAttribute('title', getContractAddress())
        } catch {
          contractNode.textContent = '未配置合约地址'
        }
      }
    }

    const projects = snapshot.projects
    setText('#profileCommitmentCount', `${projects.length} 份`)
    const list = $('#profileCommitmentList')
    if (list) {
      if (projects.length === 0) {
        list.innerHTML = `<p class="profile-list-empty">还没有与你绑定的承诺。去「我的承诺」创建一份，或等待被邀请加入。</p>`
      } else {
        list.innerHTML = projects
          .map((project) => {
            const member = project.members.find(
              (item) =>
                item.id === account.id ||
                item.address.toLowerCase() === account.address.toLowerCase() ||
                item.name === account.name,
            )
            const relation = addressesMatch(project.creatorAddress, account.address)
              ? '我发起的'
              : member?.status === 'quit'
                ? '已退出'
                : member?.depositLocked || member?.status === 'active'
                  ? '已加入'
                  : '待确认'
            return `
            <button class="profile-commitment-card" type="button" data-project-id="${project.id}">
              <span class="profile-commitment-tag">${relation}</span>
              <strong>${project.name}</strong>
              <em>${project.category} · ${project.members.length} 人 · 保证金 ${project.members[0]?.deposit ?? 0} ${unit()}</em>
              <small>${project.status === 'awaiting_confirmation' ? '等待确认' : project.rescuePool > 0 ? '救场进行中' : '进行中'}</small>
            </button>`
          })
          .join('')
      }
    }

    const packages = snapshot.rescuePackages
    const relatedPackages = packages.filter((pkg) => projects.some((project) => project.id === pkg.projectId))
    setText('#profileRescueCount', `${relatedPackages.length} 个`)
    const rescueList = $('#profileRescueList')
    if (rescueList) {
      if (relatedPackages.length === 0) {
        rescueList.innerHTML = `<p class="profile-list-empty">当前没有与你相关的救场任务。</p>`
      } else {
        rescueList.innerHTML = relatedPackages
          .map((pkg) => {
            const status = designBackend.getPackageStatus(snapshot!, pkg.id)
            const reward = designBackend.getPackageReward(snapshot!, pkg.id)
            return `
            <button class="profile-rescue-card" type="button" data-package-id="${pkg.id}">
              <strong>${pkg.title}</strong>
              <em>${pkg.category} · ${reward} ${unit()}</em>
              <small>${statusLabel(status)}</small>
            </button>`
          })
          .join('')
      }
    }
  }

  function addressesMatch(a?: string, b?: string) {
    return Boolean(a && b && a.toLowerCase() === b.toLowerCase())
  }

  // —— Promise modal (create) ——
  const projectNameInput = $('#projectName') as HTMLInputElement | null
  const deadlineInput = $('#promiseDeadline') as HTMLInputElement | null
  const depositInput = $('#promiseDeposit') as HTMLInputElement | null
  const customSceneField = $('#customSceneField')
  const customSceneName = $('#customSceneName') as HTMLInputElement | null
  const promiseEditor = $('#promiseEditor')
  const promiseSuccess = $('#promiseSuccess')

  const memberRowTemplate = (name: string, task: string) => `
    <div class="member-row">
      <span class="member-tag">00</span>
      <label><span>成员</span><input class="member-name" type="text" value="${name}" /></label>
      <label><span>负责的承诺</span><input class="member-task" type="text" value="${task}" /></label>
      <button class="remove-member" type="button" aria-label="移除成员">×</button>
    </div>`

  const updatePromisePreview = () => {
    const rows = [...memberList.querySelectorAll('.member-row')]
    rows.forEach((row, index) => {
      row.querySelector('.member-tag')!.textContent = String(index + 1).padStart(2, '0')
    })
    const setText = (selector: string, value: string) => {
      const node = $(selector)
      if (node) node.textContent = value
    }
    setText('#previewTitle', projectNameInput?.value.trim() || '还没写名字的承诺')
    setText('#previewDeadline', deadlineInput?.value ? deadlineInput.value.replace(/-/g, '.') : '待确定')
    setText('#previewDeposit', depositInput?.value || '0')
    setText('#previewMembers', `${rows.length} 人`)
    setText('#successProjectName', projectNameInput?.value.trim() || '共同承诺')
  }

  const applyScenePreset = (scene: DesignSceneKey) => {
    const preset = scenePresets[scene]
    document.querySelectorAll('.scene-option').forEach((item) => item.classList.remove('is-selected'))
    document.querySelector(`.scene-option[data-scene="${scene}"]`)?.classList.add('is-selected')
    if (customSceneField) customSceneField.hidden = scene !== 'custom'
    if (projectNameInput) projectNameInput.value = preset.name
    if (deadlineInput) deadlineInput.value = preset.deadline
    if (depositInput) depositInput.value = preset.deposit
    memberList.innerHTML = preset.members.map((m) => memberRowTemplate(m.name, m.task)).join('')
    const previewScene = $('#previewScene')
    if (previewScene) {
      previewScene.textContent =
        scene === 'custom' ? customSceneName?.value.trim() || '自定义场景' : preset.label
    }
    const hint = $('#promiseDepositHint')
    if (hint) {
      if (scene === 'hackathon' || scene === 'travel') {
        const floor = rescuePackagePresets[scene].subtasks.reduce((sum, t) => sum + t.reward, 0)
        hint.textContent = `该场景救场票面合计 ${floor} ${unit()}，保证金需 ≥ ${floor}`
      } else {
        hint.textContent = '自定义场景请自行保证保证金足够覆盖后续救场奖励'
      }
    }
    updatePromisePreview()
  }

  applyScenePreset('hackathon')

  document.querySelectorAll<HTMLElement>('.scene-option').forEach((button) => {
    button.addEventListener('click', () => applyScenePreset((button.dataset.scene as DesignSceneKey) || 'hackathon'))
  })

  customSceneName?.addEventListener('input', () => {
    if (!$('.scene-option[data-scene="custom"]')?.classList.contains('is-selected')) return
    const node = $('#previewScene')
    if (node) node.textContent = customSceneName.value.trim() || '自定义场景'
  })

  ;[projectNameInput, deadlineInput, depositInput].forEach((input) => {
    input?.addEventListener('input', updatePromisePreview)
  })
  memberList.addEventListener('input', updatePromisePreview)
  memberList.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    const removeButton = target.closest('.remove-member')
    if (!removeButton) return
    if (memberList.querySelectorAll('.member-row').length === 1) {
      showToast('至少留下一位承诺成员')
      return
    }
    removeButton.closest('.member-row')?.remove()
    updatePromisePreview()
  })
  $('#addMemberButton')?.addEventListener('click', () => {
    const count = memberList.querySelectorAll('.member-row').length
    if (getChainMode() === 'local' && count >= LOCAL_DEMO_MEMBER_LIMIT) {
      showToast(`本地联调最多 ${LOCAL_DEMO_MEMBER_LIMIT} 名成员`)
      return
    }
    memberList.insertAdjacentHTML('beforeend', memberRowTemplate('新成员', '待分配任务'))
    updatePromisePreview()
  })

  $('#promiseButton')?.addEventListener('click', () => {
    void (async () => {
      if (!snapshot?.wallet.isConnected) {
        if (getChainMode() === 'chain') {
          requestWalletConnect()
          return
        }
        const result = await run('连接钱包', () => designBackend.connectDemoWallet('caro'))
        if (!result) return
        showToast('已连接钱包，可以创建承诺')
      }
      if (promiseEditor) promiseEditor.hidden = false
      if (promiseSuccess) promiseSuccess.hidden = true
      updatePromisePreview()
      openModal(promiseModal)
    })()
  })

  $('#commitmentEmptyAction')?.addEventListener('click', () => {
    void (async () => {
      const action = $('#commitmentEmptyAction')?.dataset.emptyAction
      if (action === 'create') {
        $('#promiseButton')?.click()
        return
      }
      requestWalletConnect()
    })()
  })
  $('#closePromiseModal')?.addEventListener('click', () => closeModal(promiseModal))
  $('#promiseBackdrop')?.addEventListener('click', () => closeModal(promiseModal))
  $('#saveDraftButton')?.addEventListener('click', () => {
    updatePromisePreview()
    showToast(`草稿仅保存在当前表单 · 点寄出才会写入${backendLabel()}`)
  })
  $('#makeAnotherPromise')?.addEventListener('click', () => {
    if (promiseEditor) promiseEditor.hidden = false
    if (promiseSuccess) promiseSuccess.hidden = true
  })

  $('#sendPromiseButton')?.addEventListener('click', () => {
    void (async () => {
      if (!projectNameInput?.value.trim()) {
        projectNameInput?.focus()
        showToast('先给这份承诺写一个名字')
        return
      }
      const depositValue = Number(depositInput?.value || 0)
      if (!(depositValue > 0)) {
        depositInput?.focus()
        showToast('保证金必须大于 0')
        return
      }
      const selected = document.querySelector('.scene-option.is-selected') as HTMLElement | null
      const scene = (selected?.dataset.scene as DesignSceneKey) || 'hackathon'
      if (scene === 'hackathon' || scene === 'travel') {
        const floor = rescuePackagePresets[scene].subtasks.reduce((sum, t) => sum + t.reward, 0)
        if (depositValue < floor) {
          depositInput?.focus()
          showToast(`该场景救场票面合计 ${floor}，保证金至少需要 ${floor}`)
          return
        }
      }
      const rule = $('#promiseRule') as HTMLInputElement | null
      if (!rule?.checked) {
        showToast('请先确认退出与救场规则')
        return
      }
      const members = [...memberList.querySelectorAll('.member-row')].map((row) => ({
        name: (row.querySelector('.member-name') as HTMLInputElement).value,
        task: (row.querySelector('.member-task') as HTMLInputElement).value,
      }))
      if (getChainMode() === 'local' && members.length > LOCAL_DEMO_MEMBER_LIMIT) {
        showToast(`本地联调最多 ${LOCAL_DEMO_MEMBER_LIMIT} 名成员`)
        return
      }
      const result = await run('创建承诺', () =>
        designBackend.createPromise({
          scene,
          name: projectNameInput.value,
          deadline: deadlineInput?.value ?? '',
          deposit: depositValue,
          members,
          customSceneLabel: customSceneName?.value,
        }),
      )
      if (!result) return
      updatePromisePreview()
      if (promiseEditor) promiseEditor.hidden = true
      if (promiseSuccess) promiseSuccess.hidden = false
      promiseTab = 'active'
      showToast(`承诺已写入${backendLabel()} · 可进入成员确认`)
      goTo('/promises')
      syncPromiseTabs()
    })()
  })

  $('#viewPromiseCard')?.addEventListener('click', () => {
    closeModal(promiseModal)
    trackTimeout(() => openConfirmFlow(), 180)
  })

  // —— Confirm flow ——
  const setConfirmStep = (step: number) => {
    confirmFlowModal?.querySelectorAll<HTMLElement>('[data-confirm-panel]').forEach((panel) => {
      panel.hidden = Number(panel.dataset.confirmPanel) !== step
    })
    confirmFlowModal?.querySelectorAll<HTMLElement>('[data-confirm-step]').forEach((item) => {
      const itemStep = Number(item.dataset.confirmStep)
      item.classList.toggle('is-current', itemStep === step)
      item.classList.toggle('is-done', itemStep < step)
    })
  }

  const isOwnConfirmSeat = (project: Project, memberId: string) => {
    if (getChainMode() !== 'chain') return true
    const member = project.members.find((item) => item.id === memberId)
    const wallet = snapshot?.wallet.account?.address
    if (!member) return false
    if (wallet && addressesMatch(member.address, wallet)) return true
    // Creator seat: first member bound to creator / connected wallet at create time
    if (
      wallet &&
      addressesMatch(project.creatorAddress, wallet) &&
      (member.id === 'member-0' || addressesMatch(member.address, project.creatorAddress))
    ) {
      return true
    }
    // Invitee opened a specific seat link — treat selected pending seat as claimable
    const pending = readPendingInvite()
    if (pending && pending.projectId === project.id && pending.memberId === memberId) return true
    const params = new URLSearchParams(window.location.search)
    if (params.get('invite') === project.id && params.get('member') === memberId) return true
    // Connected wallet has not joined yet: allow claiming any still-open seat (one wallet → one seat)
    if (wallet) {
      const alreadyJoined = project.members.some(
        (item) =>
          (item.depositLocked || item.status === 'active') && addressesMatch(item.address, wallet),
      )
      if (!alreadyJoined && !member.depositLocked && member.status !== 'active') {
        // Prefer creator claiming own seat; teammates claim via invite link (own seat true only via invite param or address match)
        if (addressesMatch(project.creatorAddress, wallet) && member.id === project.members[0]?.id) {
          return true
        }
      }
    }
    return false
  }

  const syncConfirmActionState = (project: Project, memberId: string) => {
    const member = project.members.find((item) => item.id === memberId)
    const confirmBtn = $('#confirmCurrentMember') as HTMLButtonElement | null
    const copyBtn = $('#copyMemberInvite') as HTMLButtonElement | null
    const hint = $('#confirmSigningHint')
    const walletLabel = $('#signerWalletLabel')
    const walletValue = $('#signerWalletValue')
    const stampHint = $('#signerStampHint')
    const chain = getChainMode() === 'chain'

    if (hint) {
      hint.textContent = chain
        ? '每位成员用自己的钱包确认。把自己的席位加入后，把邀请链接发给队友。'
        : '这里用测试钱包模拟切换成员，不会发生真实转账。'
    }
    if (walletLabel) walletLabel.textContent = chain ? '钱包地址' : '测试钱包'
    if (walletValue) {
      if (chain) {
        const connected = snapshot?.wallet.account?.address
        if (member && (member.depositLocked || member.status === 'active') && member.address) {
          walletValue.textContent = shortAddress(member.address)
        } else if (connected && isOwnConfirmSeat(project, memberId)) {
          walletValue.textContent = shortAddress(connected)
        } else {
          walletValue.textContent = '待对方连接钱包'
        }
      } else {
        walletValue.textContent = shortAddress(member?.address) || '0x7C…D12'
      }
    }
    if (stampHint) {
      stampHint.textContent = chain ? '用当前连接的钱包盖章' : '在这里盖章确认'
    }

    const signed = Boolean(member && (member.depositLocked || member.status === 'active'))
    const ownSeat = memberId ? isOwnConfirmSeat(project, memberId) : false

    if (copyBtn) {
      copyBtn.hidden = !chain || signed
      copyBtn.textContent = ownSeat ? '复制我的邀请链接' : '复制该成员邀请链接'
    }
    if (confirmBtn) {
      if (!chain) {
        confirmBtn.hidden = false
        confirmBtn.disabled = signed
        confirmBtn.textContent = '确认任务并锁定保证金'
        return
      }
      confirmBtn.hidden = false
      confirmBtn.disabled = signed || !ownSeat || !snapshot?.wallet.isConnected
      if (signed) confirmBtn.textContent = '已加入'
      else if (!snapshot?.wallet.isConnected) confirmBtn.textContent = '请先连接钱包'
      else if (!ownSeat) confirmBtn.textContent = '请让该成员用邀请链接加入'
      else confirmBtn.textContent = '用当前钱包加入并锁定'
    }
  }

  const fillConfirmFlow = (preferMemberId?: string) => {
    if (!snapshot || !confirmMemberList) return
    const project = designBackend.getActiveProject(snapshot)
    if (!project) return
    const deposit = project.members[0]?.deposit ?? 0
    const setText = (selector: string, value: string) => {
      const node = $(selector)
      if (node) node.textContent = value
    }
    setText('#confirmSceneName', project.category)
    setText('#confirmProjectName', project.name)
    setText('#confirmMemberTotal', `${project.members.length} 人`)
    ;['#confirmPerDeposit', '#signerDeposit', '#confirmedPerDeposit'].forEach((selector) => {
      setText(selector, String(deposit))
    })
    setText('#confirmedTotalDeposit', String(project.totalDeposit))
    const signed = project.members.filter((m) => m.depositLocked || m.status === 'active' || m.status === 'confirmed')
      .length
    setText('#confirmedMemberCount', `${signed} / ${project.members.length}`)

    confirmMemberList.innerHTML = project.members
      .map((member, index) => {
        const signedMember = member.depositLocked || member.status === 'active'
        const selected =
          preferMemberId === member.id ||
          (!preferMemberId && !signedMember && index === project.members.findIndex((m) => !(m.depositLocked || m.status === 'active')))
        return `
        <button class="confirm-member-card${signedMember ? ' is-signed' : selected ? ' is-selected' : ''}" type="button"
          data-member-id="${member.id}" data-name="${member.name}" data-task="${member.task}">
          <i>${String(index + 1).padStart(2, '0')}</i>
          <span><strong>${member.name}</strong><small>${member.task}</small></span>
          <em>${signedMember ? '已加入' : '待加入'}</em>
        </button>`
      })
      .join('')

    const preferredCard = preferMemberId
      ? (confirmMemberList.querySelector(
          `.confirm-member-card[data-member-id="${preferMemberId}"]`,
        ) as HTMLElement | null)
      : null
    const selected =
      preferredCard ||
      confirmMemberList.querySelector('.confirm-member-card.is-selected') ||
      confirmMemberList.querySelector('.confirm-member-card:not(.is-signed)')
    if (selected) {
      // Invite deep-link may target a seat; always refresh the signer panel even if stamped.
      selectConfirmMember(selected as HTMLElement, Boolean(preferredCard))
    }
  }

  const selectConfirmMember = (card: HTMLElement, force = false) => {
    if (card.classList.contains('is-signed') && !force) return
    confirmMemberList?.querySelectorAll('.confirm-member-card').forEach((item) => {
      item.classList.toggle('is-selected', item === card)
    })
    const setText = (selector: string, value: string) => {
      const node = $(selector)
      if (node) node.textContent = value
    }
    const index = [...(confirmMemberList?.querySelectorAll('.confirm-member-card') ?? [])].indexOf(card)
    setText('#currentSignerNumber', String(index + 1).padStart(2, '0'))
    setText('#currentSignerName', card.dataset.name ?? '')
    setText('#currentSignerTask', card.dataset.task ?? '')
    const project = snapshot ? designBackend.getActiveProject(snapshot) : undefined
    if (project && card.dataset.memberId) syncConfirmActionState(project, card.dataset.memberId)
  }

  const openConfirmFlow = (preferMemberId?: string) => {
    const project = snapshot ? designBackend.getActiveProject(snapshot) : undefined
    if (!project) {
      showToast('没有可确认的承诺，请检查邀请链接是否仍有效')
      return
    }
    fillConfirmFlow(preferMemberId)
    setConfirmStep(preferMemberId ? 1 : 0)
    openModal(confirmFlowModal)
    startConfirmSyncPolling()
  }

  const startConfirmSyncPolling = () => {
    stopConfirmSyncPolling()
    if (getChainMode() !== 'chain') return
    confirmSyncTimer = window.setInterval(() => {
      if (!confirmFlowModal?.classList.contains('is-open')) {
        stopConfirmSyncPolling()
        return
      }
      void designBackend.hydrate().then((next) => {
        snapshot = next
        const selected = confirmMemberList?.querySelector(
          '.confirm-member-card.is-selected',
        ) as HTMLElement | null
        fillConfirmFlow(selected?.dataset.memberId)
        renderAll()
      })
    }, 4_000)
    timers.add(confirmSyncTimer)
  }

  const closeConfirmFlowModal = () => {
    stopConfirmSyncPolling()
    closeModal(confirmFlowModal)
  }

  const clearInviteQuery = () => {
    clearPendingInvite()
    const url = new URL(window.location.href)
    if (![...url.searchParams.keys()].some((key) => INVITE_QUERY_KEYS.includes(key as (typeof INVITE_QUERY_KEYS)[number]))) {
      return
    }
    INVITE_QUERY_KEYS.forEach((key) => url.searchParams.delete(key))
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }

  $('#openConfirmFlow')?.addEventListener('click', () => openConfirmFlow())
  $('#closeConfirmFlow')?.addEventListener('click', () => closeConfirmFlowModal())
  $('#confirmFlowBackdrop')?.addEventListener('click', () => closeConfirmFlowModal())
  $('#cancelConfirmFlow')?.addEventListener('click', () => closeConfirmFlowModal())
  $('#reviewConfirmMembers')?.addEventListener('click', () => setConfirmStep(1))
  $('#backToPromiseInvite')?.addEventListener('click', () => setConfirmStep(0))
  $('#restartConfirmFlow')?.addEventListener('click', () => {
    fillConfirmFlow()
    setConfirmStep(0)
  })
  $('#finishConfirmFlow')?.addEventListener('click', () => {
    closeConfirmFlowModal()
    trackTimeout(() => goTo('/promises'), 120)
  })

  confirmMemberList?.addEventListener('click', (event) => {
    const card = (event.target as HTMLElement).closest('.confirm-member-card') as HTMLElement | null
    if (!card) return
    if (card.classList.contains('is-signed')) {
      showToast(`${card.dataset.name} 已经确认过了`)
      return
    }
    selectConfirmMember(card)
  })

  $('#copyMemberInvite')?.addEventListener('click', () => {
    void (async () => {
      if (!snapshot) return
      const project = designBackend.getActiveProject(snapshot)
      const card = confirmMemberList?.querySelector('.confirm-member-card.is-selected') as HTMLElement | null
      if (!project || !card?.dataset.memberId) return
      try {
        const link = designBackend.buildMemberInviteLink(project, card.dataset.memberId)
        await navigator.clipboard.writeText(link)
        showToast(`已复制 ${card.dataset.name} 的邀请链接，发给对方用自己的钱包打开`)
      } catch (error) {
        showToast(error instanceof Error ? error.message : '复制失败')
      }
    })()
  })

  $('#confirmCurrentMember')?.addEventListener('click', () => {
    void (async () => {
      const card = confirmMemberList?.querySelector('.confirm-member-card.is-selected') as HTMLElement | null
      if (!card || !snapshot) return
      const project = designBackend.getActiveProject(snapshot)
      if (!project) return
      const memberId = card.dataset.memberId
      if (!memberId) return

      if (getChainMode() === 'chain' && !snapshot.wallet.isConnected) {
        requestWalletConnect()
        return
      }
      if (getChainMode() === 'chain' && !isOwnConfirmSeat(project, memberId)) {
        showToast('这个席位请发给对应成员，让对方用自己的钱包打开邀请链接')
        return
      }

      const result = await run('成员确认', () => designBackend.signMember(project.id, memberId))
      if (!result) return
      clearInviteQuery()
      fillConfirmFlow(memberId)
      const latest = designBackend.getActiveProject(result)
      const remaining = latest?.members.some((m) => !m.depositLocked && m.status !== 'active')
      if (remaining) {
        showToast(`${card.dataset.name} 已确认并锁定保证金`)
        setConfirmStep(1)
      } else {
        setConfirmStep(2)
        showToast('所有成员都已确认，保证金已锁定')
      }
    })()
  })

  // —— Exit flow ——
  const setExitStep = (step: number) => {
    exitFlowModal?.querySelectorAll<HTMLElement>('[data-exit-panel]').forEach((panel) => {
      panel.hidden = Number(panel.dataset.exitPanel) !== step
    })
    exitFlowModal?.querySelectorAll<HTMLElement>('[data-exit-step]').forEach((item) => {
      const itemStep = Number(item.dataset.exitStep)
      item.classList.toggle('is-current', itemStep === step)
      item.classList.toggle('is-done', itemStep < step)
    })
  }

  const fillExitFlow = () => {
    if (!snapshot || !exitMemberOptions) return
    const project = designBackend.getActiveProject(snapshot)
    if (!project) return
    const scene = sceneFromProject(project)
    const preferred = designBackend.findQuitCandidate(project, snapshot.wallet)
    const deposit = preferred?.deposit ?? project.members[0]?.deposit ?? 0
    const poolPreview =
      preferred?.status === 'quit'
        ? Math.max(0, project.rescuePool - project.reservedBounty) || deposit
        : deposit
    const templates =
      getChainMode() === 'chain'
        ? [
            {
              ...rescuePackagePresets[scene].subtasks[0],
              title: rescuePackagePresets[scene].title,
              category: rescuePackagePresets[scene].category,
              reward: poolPreview || deposit || 1,
            },
          ]
        : scaleRescueSubtasks(rescuePackagePresets[scene].subtasks, poolPreview || deposit || 1)
    const formatAmount = (value: number) => {
      if (!Number.isFinite(value)) return '0'
      const text = value.toFixed(6).replace(/\.?0+$/, '')
      return text || '0'
    }
    ;['#exitDepositAmount', '#exitPoolAmount', '#exitReceiptAmount'].forEach((selector) => {
      const node = $(selector)
      if (node) node.textContent = formatAmount(poolPreview || deposit)
    })
    const nodeTickets = $('#exitReceiptTickets')
    if (nodeTickets) nodeTickets.textContent = `1 个 · ${templates.length} 项交付`

    const candidates = designBackend.listExitFlowMembers(project, snapshot.wallet)
    const confirmExit = $('#confirmExitTransfer') as HTMLButtonElement | null
    const continueExit = $('#continueExitFlow') as HTMLButtonElement | null

    if (candidates.length === 0) {
      exitMemberOptions.innerHTML =
        getChainMode() === 'chain'
          ? `<p class="profile-list-empty">当前钱包没有可退出的席位。请用已加入成员的钱包连接后再申请退出。</p>`
          : `<p class="profile-list-empty">还没有可退出的成员。请先在「成员确认」里完成加入并锁定保证金。</p>`
      if (confirmExit) confirmExit.disabled = true
      if (continueExit) continueExit.disabled = true
      setTextSafe('#exitingMemberName', '—')
      setTextSafe('#exitingMemberRole', '请先完成成员加入')
      setTextSafe('#exitReceiptMember', '—')
    } else {
      if (confirmExit) confirmExit.disabled = false
      if (continueExit) continueExit.disabled = false
      const defaultId = preferred?.id ?? candidates[0].id
      exitMemberOptions.innerHTML = candidates
        .map((member, index) => {
          const pendingTickets = member.status === 'quit'
          return `
        <button class="exit-member-option${member.id === defaultId ? ' is-selected' : ''}" type="button"
          data-member-id="${member.id}" data-name="${member.name}" data-role="${member.role}"
          data-deposit="${member.deposit}" data-pending-tickets="${pendingTickets ? '1' : '0'}">
          <i>${String(index + 1).padStart(2, '0')}</i>
          <span><strong>${member.name}</strong><small>${
            pendingTickets
              ? '已退出 · 待完成出票'
              : getChainMode() === 'chain'
                ? `${member.role} · 将用当前钱包退出并自动出票`
                : `${member.role} · 已加入`
          }</small></span>
          <em aria-hidden="true"></em>
        </button>`
        })
        .join('')
      const selected =
        (exitMemberOptions.querySelector(
          `.exit-member-option[data-member-id="${defaultId}"]`,
        ) as HTMLElement | null) ??
        (exitMemberOptions.querySelector('.exit-member-option') as HTMLElement | null)
      if (selected) selectExitMember(selected)
    }

    const taskList = $('#exitTaskList')
    if (taskList) {
      taskList.innerHTML = templates
        .map(
          (task) => `
          <div class="exit-task-slip">
            <span><strong>${task.title}</strong><small>交付项 · ${task.category}</small></span>
            <b>${formatAmount(task.reward)} ${unit()}</b>
          </div>`,
        )
        .join('')
    }
  }

  const setTextSafe = (selector: string, value: string) => {
    const node = $(selector)
    if (node) node.textContent = value
  }

  const selectExitMember = (option: HTMLElement) => {
    exitMemberOptions?.querySelectorAll('.exit-member-option').forEach((item) => {
      item.classList.toggle('is-selected', item === option)
    })
    setTextSafe('#exitingMemberName', option.dataset.name ?? '')
    const pendingTickets = option.dataset.pendingTickets === '1'
    setTextSafe(
      '#exitingMemberRole',
      pendingTickets ? '已退出 · 待完成出票' : `原负责：${option.dataset.role ?? ''}`,
    )
    setTextSafe('#exitReceiptMember', option.dataset.name ?? '')

    if (!snapshot) return
    const project = designBackend.getActiveProject(snapshot)
    if (!project) return
    const scene = sceneFromProject(project)
    const selectedDeposit = Number(option.dataset.deposit || 0)
    const poolPreview = pendingTickets
      ? Math.max(0, project.rescuePool - project.reservedBounty) || selectedDeposit
      : selectedDeposit
    const amount = poolPreview || selectedDeposit
    const formatAmount = (value: number) => {
      if (!Number.isFinite(value)) return '0'
      const text = value.toFixed(6).replace(/\.?0+$/, '')
      return text || '0'
    }
    ;['#exitDepositAmount', '#exitPoolAmount', '#exitReceiptAmount'].forEach((selector) => {
      setTextSafe(selector, formatAmount(amount))
    })
    const templates =
      getChainMode() === 'chain'
        ? [
            {
              ...rescuePackagePresets[scene].subtasks[0],
              title: rescuePackagePresets[scene].title,
              category: rescuePackagePresets[scene].category,
              reward: amount || 1,
            },
          ]
        : scaleRescueSubtasks(rescuePackagePresets[scene].subtasks, amount || 1)
    const taskList = $('#exitTaskList')
    if (taskList) {
      taskList.innerHTML = templates
        .map(
          (task) => `
          <div class="exit-task-slip">
            <span><strong>${task.title}</strong><small>交付项 · ${task.category}</small></span>
            <b>${formatAmount(task.reward)} ${unit()}</b>
          </div>`,
        )
        .join('')
    }
    const nodeTickets = $('#exitReceiptTickets')
    if (nodeTickets) nodeTickets.textContent = `1 个 · ${templates.length} 项交付`
  }

  const openExitFlow = () => {
    if (!snapshot) return
    const project = designBackend.getActiveProject(snapshot)
    if (!project) {
      showToast('请先选择一份进行中的承诺')
      return
    }
    const canResumeTickets = designBackend.listMembersNeedingRescueTickets(project).length > 0
    if (!canResumeTickets && !designBackend.allMembersJoined(project)) {
      showToast('请先让全部成员完成确认并锁定保证金，再办理退出出票')
      openConfirmFlow()
      return
    }
    if (designBackend.listExitFlowMembers(project, snapshot.wallet).length === 0) {
      showToast(
        getChainMode() === 'chain'
          ? '请用已加入的成员钱包连接后，再申请自己退出'
          : '请先让成员完成确认并锁定保证金',
      )
      return
    }
    fillExitFlow()
    setExitStep(0)
    openModal(exitFlowModal)
  }

  $('#openExitFlow')?.addEventListener('click', () => openExitFlow())
  $('#openCompleteFlow')?.addEventListener('click', () => {
    void (async () => {
      if (!snapshot) return
      const live = snapshot
      const project = designBackend.resolveWorkbenchProject(live)
      if (!project) {
        showToast('请先选择一份进行中的承诺')
        return
      }
      if (!designBackend.isActiveProjectStatus(project.status)) {
        showToast('当前查看的承诺已结束，请切换到进行中的承诺')
        promiseTab = 'done'
        syncPromiseTabs()
        renderWorkspace()
        return
      }
      if (!designBackend.allMembersJoined(project)) {
        showToast('请先让全部成员完成确认并锁定保证金')
        openConfirmFlow()
        return
      }
      if (
        getChainMode() !== 'mock' &&
        !addressesMatch(project.creatorAddress, snapshot.wallet.account?.address)
      ) {
        showToast('只有承诺创建者可以提交「任务完成」，请切换到创建该承诺的钱包')
        return
      }
      if (project.reservedBounty > 0) {
        showToast('仍有未结清的救场悬赏，请先完成验收支付')
        return
      }
      const activeRescue = designBackend.listRescuePackagesForProject(live, project.id).some((pkg) => {
        const status = designBackend.getPackageStatus(live, pkg.id)
        return !['paid', 'approved', 'rejected', 'cancelled'].includes(status)
      })
      if (activeRescue) {
        showToast('救场任务进行中，请先完成验收后再结算承诺')
        return
      }
      if (project.id !== live.activeProjectId) {
        snapshot = await designBackend.setActiveProject(project.id)
      }
      const result = await run('任务完成', () => designBackend.completePromise(project.id))
      if (!result) return
      promiseTab = 'done'
      syncPromiseTabs()
      renderWorkspace()
      showToast(
        getChainMode() === 'chain'
          ? '承诺已完成 · 各成员保证金已自动退回钱包'
          : '承诺已结算完成 · 保证金已退回各成员账户',
      )
      goTo('/promises')
    })()
  })
  $('#closeExitFlow')?.addEventListener('click', () => closeModal(exitFlowModal))
  $('#exitFlowBackdrop')?.addEventListener('click', () => closeModal(exitFlowModal))
  $('#cancelExitFlow')?.addEventListener('click', () => closeModal(exitFlowModal))
  $('#continueExitFlow')?.addEventListener('click', () => {
    if (!snapshot) return
    const project = designBackend.getActiveProject(snapshot)
    if (!project || designBackend.listExitFlowMembers(project, snapshot.wallet).length === 0) {
      showToast(
        getChainMode() === 'chain'
          ? '请用已加入的成员钱包连接后，再申请自己退出'
          : '请先让成员完成确认并锁定保证金',
      )
      return
    }
    setExitStep(1)
  })
  $('#backToExitMember')?.addEventListener('click', () => setExitStep(0))
  $('#finishExitFlow')?.addEventListener('click', () => closeModal(exitFlowModal))
  $('#viewGeneratedRescueTickets')?.addEventListener('click', () => {
    closeModal(exitFlowModal)
    trackTimeout(() => goTo('/rescue'), 120)
  })

  exitMemberOptions?.addEventListener('click', (event) => {
    const option = (event.target as HTMLElement).closest('.exit-member-option') as HTMLElement | null
    if (option) selectExitMember(option)
  })

  $('#confirmExitTransfer')?.addEventListener('click', () => {
    void (async () => {
      const rule = $('#exitConfirmRule') as HTMLInputElement | null
      if (!rule?.checked) {
        showToast('请先确认保证金的救场用途')
        return
      }
      if (!snapshot) return
      const project = designBackend.getActiveProject(snapshot)
      const selected = exitMemberOptions?.querySelector('.exit-member-option.is-selected') as HTMLElement | null
      const memberId = selected?.dataset.memberId
      if (!project || !memberId) {
        showToast('请先选择已加入的退出成员')
        return
      }
      const scene = sceneFromProject(project)
      const pendingTickets = selected?.dataset.pendingTickets === '1'
      const result = await run(pendingTickets ? '继续出票' : '申请退出', () =>
        designBackend.quitAndSpawnTickets(project.id, memberId, scene),
      )
      if (!result) return
      setExitStep(2)
      showToast(
        pendingTickets
          ? `出票已补齐，完整救场任务已生成`
          : getChainMode() === 'chain'
            ? `退出已上链，救场悬赏已自动发布到大厅`
            : `退出已写入${backendLabel()}，完整救场任务已生成`,
      )
    })()
  })

  // —— Rescue flow ——
  const setRescueStep = (step: number) => {
    rescueFlowModal?.querySelectorAll<HTMLElement>('[data-rescue-panel]').forEach((panel) => {
      panel.hidden = Number(panel.dataset.rescuePanel) !== step
    })
    rescueFlowModal?.querySelectorAll<HTMLElement>('[data-rescue-step]').forEach((item) => {
      const itemStep = Number(item.dataset.rescueStep)
      item.classList.toggle('is-current', itemStep === step)
      item.classList.toggle('is-done', itemStep < step)
    })
  }

  const fillRescuePackage = (packageId: string) => {
    if (!snapshot) return
    const pkg = snapshot.rescuePackages.find((item) => item.id === packageId)
    if (!pkg) return
    const bounties = designBackend.getPackageBounties(snapshot, packageId)
    const reward = designBackend.getPackageReward(snapshot, packageId)
    const status = designBackend.getPackageStatus(snapshot, packageId)
    const setText = (selector: string, value: string) => {
      const node = $(selector)
      if (node) node.textContent = value
    }
    ;['#rescueFlowTitle', '#rescueDetailTitle', '#claimedTaskName', '#paidTaskName'].forEach((selector) => {
      setText(selector, pkg.title)
    })
    ;['#rescueReward', '#claimedReward', '#paidReward'].forEach((selector) => {
      setText(selector, String(reward))
    })
    setText('#rescueFlowCategory', pkg.category)
    setText('#rescueDeadline', '整包交付')
    setText('#rescueProof', '全部交付项的成果链接与说明')
    setText('#rescueTaskCopy', pkg.summary)
    setText('#rescueCheckOne', bounties[0]?.title ?? '')
    setText('#rescueCheckTwo', bounties[1]?.title ?? '')
    setText('#rescueCheckThree', bounties[2]?.title ?? bounties[0]?.acceptanceCriteria[0] ?? '')
    setText('#submissionProofSummary', `${bounties.length} 项交付 · 整包验收`)
    const link = $('#rescueWorkLink') as HTMLInputElement | null
    const note = $('#rescueWorkNote') as HTMLTextAreaElement | null
    const linkError = $('#rescueWorkLinkError')
    const sample = bounties.find((item) => item.submission) ?? bounties[0]
    if (link) {
      link.value = sample?.submission?.githubUrl || ''
      link.classList.remove('is-invalid')
    }
    if (linkError) linkError.hidden = true
    if (note) note.value = sample?.submission?.summary || ''
    if (sample?.submission) {
      setText('#reviewWorkLink', sample.submission.githubUrl.replace(/^https?:\/\//, ''))
      setText('#reviewWorkNote', sample.submission.summary)
    }
    void status
  }

  const openRescuePackageFlow = (packageId: string) => {
    if (!snapshot) return
    const pkg = snapshot.rescuePackages.find((item) => item.id === packageId)
    if (!pkg) return
    activeRescuePackageId = packageId
    fillRescuePackage(packageId)
    const status = designBackend.getPackageStatus(snapshot, packageId)
    const stepMap: Record<Bounty['status'], number> = {
      open: 0,
      claimed: 1,
      submitted: 2,
      revision_required: 1,
      approved: 3,
      paid: 3,
      rejected: 3,
      cancelled: 0,
    }
    setRescueStep(stepMap[status] ?? 0)
    openModal(rescueFlowModal)

    const project = snapshot.projects.find((item) => item.id === pkg.projectId)
    const isCreator =
      getChainMode() === 'mock' ||
      Boolean(
        snapshot.wallet.account &&
          project &&
          addressesMatch(project.creatorAddress, snapshot.wallet.account.address),
      )
    const canReview = status === 'submitted' && isCreator
    const approveBtn = $('#approveRescueWork') as HTMLButtonElement | null
    const revisionBtn = $('#requestRescueRevision') as HTMLButtonElement | null
    if (approveBtn) {
      approveBtn.hidden = status !== 'submitted'
      approveBtn.disabled = !canReview
      approveBtn.title = canReview
        ? '验收通过并支付救场奖励'
        : '只有承诺创建者可以验收支付，请切换到创建者钱包'
    }
    if (revisionBtn) {
      revisionBtn.hidden = status !== 'submitted'
      revisionBtn.disabled = !canReview
      revisionBtn.title = canReview ? '要求补位者返修后再提交' : '只有承诺创建者可以要求返修'
    }
  }

  $('#openRescueReview')?.addEventListener('click', () => {
    if (!snapshot) return
    const project = designBackend.getActiveProject(snapshot)
    if (!project) {
      showToast('请先选择一份进行中的承诺')
      return
    }
    const pending = designBackend.listPackagesAwaitingCreatorReview(snapshot, project.id)
    if (pending.length === 0) {
      showToast('当前没有待验收的救场成果')
      return
    }
    openRescuePackageFlow(pending[0].id)
  })

  $('#viewProjectRescue')?.addEventListener('click', (event) => {
    if (!snapshot) return
    const project = designBackend.getActiveProject(snapshot)
    const pending = project
      ? designBackend.listPackagesAwaitingCreatorReview(snapshot, project.id)
      : []
    if (pending.length > 0) {
      event.preventDefault()
      rescueTab = 'review'
      syncRescueTabs()
      goTo('/rescue')
      trackTimeout(() => openRescuePackageFlow(pending[0].id), 120)
    }
  })

  ticketList.addEventListener('click', (event) => {
    const packageCard = (event.target as HTMLElement).closest(
      '.rescue-ticket, .rescue-package',
    ) as HTMLElement | null
    const packageId =
      (event.target as HTMLElement).closest('[data-package-id]')?.getAttribute('data-package-id') ??
      packageCard?.dataset.packageId
    if (!packageId) return
    openRescuePackageFlow(packageId)
  })

  ticketList.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const packageCard = (event.target as HTMLElement).closest('.rescue-ticket') as HTMLElement | null
    const packageId = packageCard?.dataset.packageId
    if (!packageId) return
    event.preventDefault()
    openRescuePackageFlow(packageId)
  })

  $('#rescueButton')?.addEventListener('click', () => {
    goTo('/rescue')
  })

  $('#closeRescueFlow')?.addEventListener('click', () => closeModal(rescueFlowModal))
  $('#rescueFlowBackdrop')?.addEventListener('click', () => closeModal(rescueFlowModal))
  $('#backToRescueHall')?.addEventListener('click', () => {
    closeModal(rescueFlowModal)
    trackTimeout(() => goTo('/rescue'), 120)
  })
  $('#returnToTaskDetail')?.addEventListener('click', () => setRescueStep(0))
  $('#finishRescueFlow')?.addEventListener('click', () => {
    closeModal(rescueFlowModal)
    trackTimeout(() => goTo('/rescue'), 120)
    showToast(`救场流程已同步到${backendLabel()}`)
  })

  $('#claimRescueTask')?.addEventListener('click', () => {
    void (async () => {
      if (!activeRescuePackageId) return
      const result = await run('领取整包救场', () =>
        designBackend.claimRescuePackage(activeRescuePackageId!),
      )
      if (!result) return
      rescueTab = 'mine'
      renderRescueHall()
      fillRescuePackage(activeRescuePackageId)
      setRescueStep(1)
      showToast('已领取完整救场任务 · 请提交成果')
    })()
  })

  $('#submitRescueWork')?.addEventListener('click', () => {
    void (async () => {
      if (!activeRescuePackageId) {
        showToast('当前没有可提交的救场任务')
        return
      }
      const linkInput = $('#rescueWorkLink') as HTMLInputElement | null
      const noteInput = $('#rescueWorkNote') as HTMLTextAreaElement | null
      const linkError = $('#rescueWorkLinkError')
      const link = linkInput?.value.trim() ?? ''
      linkInput?.classList.remove('is-invalid')
      if (linkError) linkError.hidden = true
      if (!link) {
        linkInput?.classList.add('is-invalid')
        if (linkError) linkError.hidden = false
        linkInput?.focus()
        showToast('请先填写可验收的成果链接')
        return
      }
      const result = await run('提交整包成果', () =>
        designBackend.submitRescuePackage(
          activeRescuePackageId!,
          link,
          noteInput?.value.trim() ?? '',
        ),
      )
      if (!result) return
      fillRescuePackage(activeRescuePackageId)
      setRescueStep(2)
      showToast(`整包成果已写入${backendLabel()}，等待验收`)
    })()
  })

  $('#requestRescueRevision')?.addEventListener('click', () => {
    void (async () => {
      if (!activeRescuePackageId) {
        showToast('当前没有可验收的救场任务')
        return
      }
      const result = await run('退回修改', () =>
        designBackend.requestPackageRevision(activeRescuePackageId!),
      )
      if (!result) return
      fillRescuePackage(activeRescuePackageId)
      setRescueStep(1)
      showToast('已退回整包修改 · 已切回负责人账户')
    })()
  })

  $('#approveRescueWork')?.addEventListener('click', () => {
    void (async () => {
      if (!activeRescuePackageId) {
        showToast('当前没有可验收的救场任务')
        return
      }
      const result = await run('验收支付', () =>
        designBackend.approveRescuePackage(activeRescuePackageId!),
      )
      if (!result) return
      fillRescuePackage(activeRescuePackageId)
      setRescueStep(3)
      rescueTab = 'done'
      showToast('救场已结算 · 回到承诺页点「任务完成」结束承诺')
    })()
  })

  $('#replayRescueFlow')?.addEventListener('click', () => {
    setRescueStep(0)
  })

  // —— Wallet ——
  $('#closeWalletConnectBackdrop')?.addEventListener('click', () => closeModal(walletConnectModal))
  document.querySelectorAll<HTMLElement>('[data-wallet-connector]').forEach((button) => {
    button.addEventListener('click', () => {
      const connector = (button.dataset.walletConnector as 'Browser Wallet' | 'Rabby' | 'MetaMask') || 'Browser Wallet'
      void (async () => {
        const result = await run('连接钱包', () => designBackend.connectInjectedWallet(connector))
        if (!result) return
        closeModal(walletConnectModal)
        showToast(`已连接 · ${result.wallet.account?.name ?? '钱包'}`)
        const pending = readPendingInvite()
        if (pending) {
          const refreshed = await run('同步邀请', () => designBackend.acceptMemberInvite(pending))
          if (refreshed) {
            openConfirmFlow(pending.memberId)
            return
          }
        }
        if (confirmFlowModal?.classList.contains('is-open')) {
          const project = designBackend.getActiveProject(result)
          const card = confirmMemberList?.querySelector('.confirm-member-card.is-selected') as HTMLElement | null
          if (project && card?.dataset.memberId) syncConfirmActionState(project, card.dataset.memberId)
        }
      })()
    })
  })

  $('#walletButton')?.addEventListener('click', () => {
    void (async () => {
      if (snapshot?.wallet.isConnected) {
        if (getChainMode() === 'chain') {
          const result = await run('断开钱包', () => designBackend.disconnectWallet())
          if (result) showToast('已断开钱包')
          return
        }
        const accounts = await contractService.getAccounts()
        const currentId = snapshot.wallet.account?.id
        const order = ['caro', 'builder-07', 'yunn']
        const next = order[(order.indexOf(currentId ?? 'caro') + 1) % order.length]
        const result = await run('切换账户', () => designBackend.switchAccount(next))
        if (result) {
          const name = accounts.find((a) => a.id === next)?.name ?? next
          showToast(`已切换为 ${name}`)
        }
        return
      }
      requestWalletConnect()
    })()
  })

  document.querySelectorAll<HTMLElement>('[data-promise-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      promiseTab = (tab.dataset.promiseTab as 'create' | 'active' | 'done') || 'active'
      syncPromiseTabs()
      renderWorkspace()
    })
  })

  document.querySelectorAll<HTMLElement>('[data-rescue-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      rescueTab = (tab.dataset.rescueTab as 'open' | 'mine' | 'done' | 'review') || 'open'
      renderRescueHall()
    })
  })

  $('#promisesCreateButton')?.addEventListener('click', () => {
    $('#promiseButton')?.click()
  })

  const onRouteChange = (event: Event) => {
    const path = (event as CustomEvent<string>).detail || getPath()
    syncRoute(path)
  }
  window.addEventListener('dont-ghost-me:route-change', onRouteChange)

  $('#profileConnectButton')?.addEventListener('click', () => {
    requestWalletConnect()
  })

  $('#profileCommitmentList')?.addEventListener('click', (event) => {
    const card = (event.target as HTMLElement).closest('.profile-commitment-card') as HTMLElement | null
    if (!card) return
    const projectId = card.dataset.projectId
    if (projectId) {
      void run('切换承诺', () => designBackend.setActiveProject(projectId)).then(() => {
        promiseTab = 'active'
        goTo('/promises')
        syncPromiseTabs()
      })
      return
    }
    goTo('/promises')
  })

  $('#profileRescueList')?.addEventListener('click', (event) => {
    const card = (event.target as HTMLElement).closest('.profile-rescue-card') as HTMLElement | null
    if (!card) return
    goTo('/rescue')
  })

  // Initial hydrate — failures must not leave UI dead.
  // Invite links skip the full hydrate burst (it doubles RPC load and trips Monad's 15/s cap).
  const bootParams = new URLSearchParams(window.location.search)
  const bootInvite =
    inviteFromSearchParams(bootParams) ??
    (getPath() === '/promises' ? readPendingInvite() : null)

  const finishInviteOpen = (accepted: DesignSnapshot, invite: PendingInvite) => {
    snapshot = accepted
    renderAll()

    const openInviteConfirm = () => {
      closeIntro()
      openConfirmFlow(invite.memberId)
    }

    if (!accepted.wallet.isConnected) {
      showToast('请连接你自己的钱包，确认这份承诺')
      openInviteConfirm()
      trackTimeout(() => requestWalletConnect(), 280)
    } else {
      showToast('已打开邀请 · 用当前钱包确认你的席位')
      trackTimeout(openInviteConfirm, 120)
    }
  }

  if (getChainMode() === 'chain' && bootInvite) {
    writePendingInvite(bootInvite)
    if (getPath() !== '/promises') {
      goTo(`/promises?${inviteSearchParams(bootInvite).toString()}`)
    } else {
      syncRoute('/promises')
    }
    void run('打开邀请', () => designBackend.acceptMemberInvite(bootInvite)).then((accepted) => {
      if (!accepted) return
      finishInviteOpen(accepted, bootInvite)
    })
  } else {
    void designBackend
      .hydrate()
      .then(async (initial) => {
        snapshot = initial
        renderAll()

        if (getChainMode() !== 'chain' && bootInvite) {
          showToast('邀请链接需要 Monad 公链模式（VITE_CHAIN_MODE=chain）')
        }

        if (isOnChainBackend && initial.wallet.isConnected && initial.projects.length === 0) {
          showToast(
            getChainMode() === 'chain'
              ? 'Monad 测试网已就绪 · 还没有项目，先创建一份承诺'
              : '本地链已就绪 · 还没有项目，先创建一份承诺',
          )
        }
      })
      .catch((error) => {
        console.error('[design] hydrate failed', error)
        snapshot = {
          wallet: { isConnected: false },
          projects: [],
          bounties: [],
          activeProjectId: '',
          activeScene: 'hackathon',
          rescuePackages: [],
        }
        renderAll()

        const params = new URLSearchParams(window.location.search)
        const invite = inviteFromSearchParams(params)
        if (getChainMode() === 'chain' && invite) {
          showToast('链读取失败，仍可尝试打开邀请；请确认网络后连接钱包')
          void run('打开邀请', () => designBackend.acceptMemberInvite(invite)).then((accepted) => {
            if (!accepted) return
            finishInviteOpen(accepted, invite)
          })
          return
        }

        showToast(
          `链连接失败：${error instanceof Error ? error.message : getChainMode() === 'chain' ? '请检查 Monad RPC' : '请确认 Anvil 在运行'}`,
        )
      })
  }

  // Double-click brand to reset workspace data (escape hatch)
  $('.brand')?.addEventListener('dblclick', (event) => {
    event.preventDefault()
    void run('重置数据', () => designBackend.resetDemo()).then((result) => {
      if (!result) return
      if (isOnChainBackend) {
        showToast('已清除浏览器索引与演示元数据 · 链上状态需重启 Anvil 并重新部署')
      } else {
        showToast('工作区数据已清空')
      }
    })
  })

  return () => {
    stopConfirmSyncPolling()
    timers.forEach((id) => {
      window.clearTimeout(id)
      window.clearInterval(id)
    })
    timers.clear()
    document.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('dont-ghost-me:route-change', onRouteChange)
    document.body.classList.remove('modal-open', 'design-busy')
  }
}
