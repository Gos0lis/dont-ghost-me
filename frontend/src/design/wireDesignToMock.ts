import type { Bounty, Project } from '../contracts/types'
import {
  workspaceCopy,
  scenePresets,
  rescueTicketTemplates,
  type DesignSceneKey,
} from '../data/scenePresets'
import { designBackend, type DesignSnapshot } from '../services/designBackend'
import { contractService } from '../services/contractService'

type ToastFn = (message: string) => void

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
    default:
      return status
  }
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

/**
 * Bind the V11 design DOM to designBackend (mock chain).
 * Visual chrome stays in the HTML; mutations go through localStorage-backed mock.
 */
export function wireDesignToMock(): () => void {
  const timers = new Set<number>()
  const trackTimeout = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
    return id
  }

  let snapshot: DesignSnapshot | null = null
  let busy = false
  let activeRescueId: string | null = null
  let toastTimer = 0

  const intro = $('#intro')
  const introBrand = $('#introBrand')
  const flock = $('#flock')
  const app = $('#app')
  const toast = $('#toast')
  const promiseModal = $('#promiseModal')
  const confirmFlowModal = $('#confirmFlowModal')
  const exitFlowModal = $('#exitFlowModal')
  const rescueFlowModal = $('#rescueFlowModal')
  const ticketList = $('#ticketList')
  const memberList = $('#memberList')
  const confirmMemberList = $('#confirmMemberList')
  const exitMemberOptions = $('#exitMemberOptions')

  if (!intro || !app || !toast || !promiseModal || !ticketList || !memberList) {
    console.error('[design] required DOM nodes missing')
    return () => undefined
  }

  const showToast: ToastFn = (message) => {
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
      showToast('请等待上一笔模拟交易完成')
      return null
    }
    setBusy(true)
    try {
      snapshot = await action()
      renderAll()
      return snapshot
    } catch (error) {
      const message = error instanceof Error ? error.message : '操作失败'
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

  let introClosed = false
  const closeIntro = () => {
    if (introClosed) return
    introClosed = true
    intro.classList.add('is-hidden')
    app.classList.add('is-ready')
    app.setAttribute('aria-hidden', 'false')
  }

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

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  document.querySelectorAll<HTMLElement>('[data-target]').forEach((button) => {
    button.addEventListener('click', () => scrollToSection(button.dataset.target ?? 'home'))
  })
  document.querySelectorAll<HTMLElement>('[data-scroll]').forEach((button) => {
    button.addEventListener('click', () => scrollToSection(button.dataset.scroll ?? 'home'))
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
      !confirmFlowModal?.classList.contains('is-open') &&
      !exitFlowModal?.classList.contains('is-open') &&
      !rescueFlowModal?.classList.contains('is-open')
    ) {
      document.body.classList.remove('modal-open')
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    if (promiseModal.classList.contains('is-open')) closeModal(promiseModal)
    if (confirmFlowModal?.classList.contains('is-open')) closeModal(confirmFlowModal)
    if (exitFlowModal?.classList.contains('is-open')) closeModal(exitFlowModal)
    if (rescueFlowModal?.classList.contains('is-open')) closeModal(rescueFlowModal)
  }
  document.addEventListener('keydown', onKeyDown)

  const renderWallet = () => {
    const button = $('#walletButton')
    if (!button || !snapshot) return
    const account = snapshot.wallet.account
    if (snapshot.wallet.isConnected && account) {
      button.classList.add('is-connected')
      button.innerHTML = `<span class="wallet-dot" aria-hidden="true"></span>测试钱包 · ${account.name}`
    } else {
      button.classList.remove('is-connected')
      button.innerHTML = `<span class="wallet-dot" aria-hidden="true"></span>连接测试钱包`
    }
  }

  const renderTickets = (project: Project, bounties: Bounty[]) => {
    ticketList.innerHTML = bounties
      .map((bounty, index) => {
        const meta = designBackend.getTicketMeta(bounty.id)
        const category = meta?.category ?? project.category
        const summary = meta?.summary ?? bounty.description.slice(0, 24)
        return `
        <button class="rescue-ticket${bounty.status === 'paid' ? ' is-completed' : ''}" type="button" data-bounty-id="${bounty.id}">
          <span class="ticket-number">NO. ${String(index + 1).padStart(2, '0')}</span>
          <span class="ticket-copy">
            <small>${category}</small>
            <strong>${bounty.title}</strong>
            <em>${summary}</em>
          </span>
          <span class="ticket-reward"><b>${bounty.reward}</b> MON</span>
          <span class="ticket-status">${statusLabel(bounty.status)}</span>
        </button>`
      })
      .join('')
  }

  const renderWorkspace = () => {
    if (!snapshot) return
    const project = designBackend.getActiveProject(snapshot)
    if (!project) return
    const scene = snapshot.activeScene
    const copy = workspaceCopy[scene]
    const bounties = designBackend.getProjectBounties(snapshot)
    const commitment = $('#commitment')
    if (commitment) commitment.dataset.scene = scene

    const setText = (selector: string, value: string) => {
      const node = $(selector)
      if (node) node.textContent = value
    }

    setText('#workspaceEyebrow', copy.eyebrow)
    setText('#workspaceDescription', copy.workspaceDescription)
    setText('#projectSceneLabel', copy.label)
    setText('#projectCardTitle', project.name)
    setText('#projectSummary', project.description)
    setText('#projectMemberCount', `${project.members.length} 人`)
    setText('#projectDeposit', `${project.members[0]?.deposit ?? 0} MON`)
    setText('#projectStage', project.status === 'awaiting_confirmation' ? '等待确认' : project.category)
    const [t1, t2, t3, t4] = timelineLabels(project)
    setText('#timelineOne', t1)
    setText('#timelineTwo', t2)
    setText('#timelineThree', t3)
    setText('#timelineFour', t4)
    setText('#fundAmount', String(project.rescuePool))
    const fundDescription = $('#fundDescription')
    if (fundDescription) {
      fundDescription.innerHTML =
        project.rescuePool > 0
          ? `退出成员的保证金<br />已进入救场池`
          : `当前救场池为空<br />退出后保证金将转入此处`
    }
    setText('#rescueBoardEyebrow', copy.rescueEyebrow)
    setText('#rescueBoardDescription', copy.rescueDescription)

    document.querySelectorAll<HTMLElement>('[data-demo-scene]').forEach((button) => {
      const selected = button.dataset.demoScene === scene
      button.classList.toggle('is-active', selected)
      button.setAttribute('aria-selected', String(selected))
    })

    renderTickets(project, bounties)
    renderWallet()
  }

  const renderAll = () => {
    renderWorkspace()
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
    memberList.insertAdjacentHTML('beforeend', memberRowTemplate('新成员', '待分配任务'))
    updatePromisePreview()
  })

  $('#promiseButton')?.addEventListener('click', () => {
    if (promiseEditor) promiseEditor.hidden = false
    if (promiseSuccess) promiseSuccess.hidden = true
    updatePromisePreview()
    openModal(promiseModal)
  })
  $('#closePromiseModal')?.addEventListener('click', () => closeModal(promiseModal))
  $('#promiseBackdrop')?.addEventListener('click', () => closeModal(promiseModal))
  $('#saveDraftButton')?.addEventListener('click', () => {
    updatePromisePreview()
    showToast('草稿仅保存在当前表单 · 点寄出才会写入假后端')
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
      const rule = $('#promiseRule') as HTMLInputElement | null
      if (!rule?.checked) {
        showToast('请先确认退出与救场规则')
        return
      }
      const selected = document.querySelector('.scene-option.is-selected') as HTMLElement | null
      const scene = (selected?.dataset.scene as DesignSceneKey) || 'hackathon'
      const members = [...memberList.querySelectorAll('.member-row')].map((row) => ({
        name: (row.querySelector('.member-name') as HTMLInputElement).value,
        task: (row.querySelector('.member-task') as HTMLInputElement).value,
      }))
      const result = await run('创建承诺', () =>
        designBackend.createPromise({
          scene,
          name: projectNameInput.value,
          deadline: deadlineInput?.value ?? '',
          deposit: Number(depositInput?.value || 0),
          members,
          customSceneLabel: customSceneName?.value,
        }),
      )
      if (!result) return
      updatePromisePreview()
      if (promiseEditor) promiseEditor.hidden = true
      if (promiseSuccess) promiseSuccess.hidden = false
      showToast('承诺已写入假后端 · 可进入成员确认')
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

  const fillConfirmFlow = () => {
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
        return `
        <button class="confirm-member-card${signedMember ? ' is-signed' : index === 0 ? ' is-selected' : ''}" type="button"
          data-member-id="${member.id}" data-name="${member.name}" data-task="${member.task}">
          <i>${String(index + 1).padStart(2, '0')}</i>
          <span><strong>${member.name}</strong><small>${member.task}</small></span>
          <em>${signedMember ? '已确认' : '待确认'}</em>
        </button>`
      })
      .join('')

    const selected =
      confirmMemberList.querySelector('.confirm-member-card.is-selected') ??
      confirmMemberList.querySelector('.confirm-member-card:not(.is-signed)')
    if (selected) selectConfirmMember(selected as HTMLElement)
  }

  const selectConfirmMember = (card: HTMLElement) => {
    if (card.classList.contains('is-signed')) return
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
  }

  const openConfirmFlow = () => {
    fillConfirmFlow()
    setConfirmStep(0)
    openModal(confirmFlowModal)
  }

  $('#openConfirmFlow')?.addEventListener('click', () => openConfirmFlow())
  $('#closeConfirmFlow')?.addEventListener('click', () => closeModal(confirmFlowModal))
  $('#confirmFlowBackdrop')?.addEventListener('click', () => closeModal(confirmFlowModal))
  $('#cancelConfirmFlow')?.addEventListener('click', () => closeModal(confirmFlowModal))
  $('#reviewConfirmMembers')?.addEventListener('click', () => setConfirmStep(1))
  $('#backToPromiseInvite')?.addEventListener('click', () => setConfirmStep(0))
  $('#restartConfirmFlow')?.addEventListener('click', () => {
    fillConfirmFlow()
    setConfirmStep(0)
  })
  $('#finishConfirmFlow')?.addEventListener('click', () => {
    closeModal(confirmFlowModal)
    trackTimeout(() => scrollToSection('commitment'), 120)
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

  $('#confirmCurrentMember')?.addEventListener('click', () => {
    void (async () => {
      const card = confirmMemberList?.querySelector('.confirm-member-card.is-selected') as HTMLElement | null
      if (!card || !snapshot) return
      const project = designBackend.getActiveProject(snapshot)
      if (!project) return
      const memberId = card.dataset.memberId
      if (!memberId) return
      const result = await run('成员确认', () => designBackend.signMember(project.id, memberId))
      if (!result) return
      fillConfirmFlow()
      const latest = designBackend.getActiveProject(result)
      const remaining = latest?.members.some((m) => !m.depositLocked)
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
    const scene = snapshot.activeScene
    const templates = scene === 'travel' ? 3 : 2
    const deposit = designBackend.findQuitCandidate(project)?.deposit ?? project.members[0]?.deposit ?? 0
    ;['#exitDepositAmount', '#exitPoolAmount', '#exitReceiptAmount'].forEach((selector) => {
      const node = $(selector)
      if (node) node.textContent = String(deposit)
    })
    const nodeTickets = $('#exitReceiptTickets')
    if (nodeTickets) nodeTickets.textContent = `${templates} 张`

    const candidates = project.members.filter((m) => m.status !== 'quit')
    exitMemberOptions.innerHTML = candidates
      .map(
        (member, index) => `
        <button class="exit-member-option${index === 0 ? ' is-selected' : ''}" type="button"
          data-member-id="${member.id}" data-name="${member.name}" data-role="${member.role}">
          <i>${String(index + 1).padStart(2, '0')}</i>
          <span><strong>${member.name}</strong><small>${member.role}</small></span>
          <em aria-hidden="true"></em>
        </button>`,
      )
      .join('')

    const first = exitMemberOptions.querySelector('.exit-member-option') as HTMLElement | null
    if (first) selectExitMember(first)

    const taskList = $('#exitTaskList')
    if (taskList) {
      const tickets = rescueTicketTemplates[snapshot.activeScene]
      taskList.innerHTML = tickets
        .map(
          (task) => `
          <div class="exit-task-slip">
            <span><strong>${task.title}</strong><small>${task.category}</small></span>
            <b>${task.reward} MON</b>
          </div>`,
        )
        .join('')
    }
  }

  const selectExitMember = (option: HTMLElement) => {
    exitMemberOptions?.querySelectorAll('.exit-member-option').forEach((item) => {
      item.classList.toggle('is-selected', item === option)
    })
    const setText = (selector: string, value: string) => {
      const node = $(selector)
      if (node) node.textContent = value
    }
    setText('#exitingMemberName', option.dataset.name ?? '')
    setText('#exitingMemberRole', `原负责：${option.dataset.role ?? ''}`)
    setText('#exitReceiptMember', option.dataset.name ?? '')
  }

  const openExitFlow = () => {
    fillExitFlow()
    setExitStep(0)
    openModal(exitFlowModal)
  }

  $('#openExitFlow')?.addEventListener('click', () => openExitFlow())
  $('#closeExitFlow')?.addEventListener('click', () => closeModal(exitFlowModal))
  $('#exitFlowBackdrop')?.addEventListener('click', () => closeModal(exitFlowModal))
  $('#cancelExitFlow')?.addEventListener('click', () => closeModal(exitFlowModal))
  $('#continueExitFlow')?.addEventListener('click', () => setExitStep(1))
  $('#backToExitMember')?.addEventListener('click', () => setExitStep(0))
  $('#finishExitFlow')?.addEventListener('click', () => closeModal(exitFlowModal))
  $('#viewGeneratedRescueTickets')?.addEventListener('click', () => {
    closeModal(exitFlowModal)
    trackTimeout(() => scrollToSection('rescue'), 120)
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
      if (!project || !memberId) return
      const result = await run('成员退出', () =>
        designBackend.quitAndSpawnTickets(project.id, memberId, snapshot!.activeScene),
      )
      if (!result) return
      setExitStep(2)
      showToast('退出已写入假后端，救场票已生成')
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

  const fillRescueTask = (bounty: Bounty) => {
    const meta = designBackend.getTicketMeta(bounty.id)
    const setText = (selector: string, value: string) => {
      const node = $(selector)
      if (node) node.textContent = value
    }
    ;['#rescueFlowTitle', '#rescueDetailTitle', '#claimedTaskName', '#paidTaskName'].forEach((selector) => {
      setText(selector, bounty.title)
    })
    ;['#rescueReward', '#claimedReward', '#paidReward'].forEach((selector) => {
      setText(selector, String(bounty.reward))
    })
    setText('#rescueFlowCategory', meta?.category ?? '救场任务')
    setText('#rescueDeadline', meta?.deadlineLabel ?? bounty.deadline.slice(0, 10))
    setText('#rescueProof', meta?.proof ?? '成果链接与说明')
    setText('#rescueTaskCopy', meta?.copy ?? bounty.description)
    setText('#rescueCheckOne', meta?.checks?.[0] ?? bounty.acceptanceCriteria[0] ?? '')
    setText('#rescueCheckTwo', meta?.checks?.[1] ?? bounty.acceptanceCriteria[1] ?? '')
    setText('#rescueCheckThree', meta?.checks?.[2] ?? bounty.acceptanceCriteria[2] ?? '')
    setText('#submissionProofSummary', meta?.proofSummary ?? '成果证明')
    const link = $('#rescueWorkLink') as HTMLInputElement | null
    const note = $('#rescueWorkNote') as HTMLTextAreaElement | null
    if (link) link.value = bounty.submission?.githubUrl || meta?.workLink || ''
    if (note) note.value = bounty.submission?.summary || meta?.workNote || ''
    if (bounty.submission) {
      setText('#reviewWorkLink', bounty.submission.githubUrl.replace(/^https?:\/\//, ''))
      setText('#reviewWorkNote', bounty.submission.summary)
    }
  }

  const openRescueFlow = (bountyId: string) => {
    if (!snapshot) return
    const bounty = snapshot.bounties.find((item) => item.id === bountyId)
    if (!bounty) return
    activeRescueId = bountyId
    fillRescueTask(bounty)
    const stepMap: Record<Bounty['status'], number> = {
      open: 0,
      claimed: 1,
      submitted: 2,
      revision_required: 1,
      approved: 3,
      paid: 3,
    }
    setRescueStep(stepMap[bounty.status] ?? 0)
    openModal(rescueFlowModal)
  }

  ticketList.addEventListener('click', (event) => {
    const ticket = (event.target as HTMLElement).closest('.rescue-ticket') as HTMLElement | null
    if (!ticket?.dataset.bountyId) return
    openRescueFlow(ticket.dataset.bountyId)
  })

  $('#rescueButton')?.addEventListener('click', () => {
    const first = ticketList.querySelector('.rescue-ticket') as HTMLElement | null
    if (first?.dataset.bountyId) openRescueFlow(first.dataset.bountyId)
    else showToast('当前没有救场票，请先模拟成员退出')
  })

  $('#closeRescueFlow')?.addEventListener('click', () => closeModal(rescueFlowModal))
  $('#rescueFlowBackdrop')?.addEventListener('click', () => closeModal(rescueFlowModal))
  $('#backToRescueHall')?.addEventListener('click', () => {
    closeModal(rescueFlowModal)
    trackTimeout(() => scrollToSection('rescue'), 120)
  })
  $('#returnToTaskDetail')?.addEventListener('click', () => setRescueStep(0))
  $('#finishRescueFlow')?.addEventListener('click', () => {
    closeModal(rescueFlowModal)
    trackTimeout(() => scrollToSection('rescue'), 120)
    showToast('救场流程已同步到假后端')
  })

  $('#claimRescueTask')?.addEventListener('click', () => {
    void (async () => {
      if (!activeRescueId) return
      const result = await run('领取悬赏', () => designBackend.claimBounty(activeRescueId!))
      if (!result) return
      const bounty = result.bounties.find((item) => item.id === activeRescueId)
      if (bounty) fillRescueTask(bounty)
      setRescueStep(1)
      showToast('已用救场者账户领取任务')
    })()
  })

  $('#submitRescueWork')?.addEventListener('click', () => {
    void (async () => {
      if (!activeRescueId) return
      const linkInput = $('#rescueWorkLink') as HTMLInputElement | null
      const noteInput = $('#rescueWorkNote') as HTMLTextAreaElement | null
      if (!linkInput?.value.trim()) {
        linkInput?.focus()
        showToast('先放入一个可以验收的成果链接')
        return
      }
      const result = await run('提交成果', () =>
        designBackend.submitBounty(activeRescueId!, linkInput.value.trim(), noteInput?.value.trim() ?? ''),
      )
      if (!result) return
      const bounty = result.bounties.find((item) => item.id === activeRescueId)
      if (bounty) fillRescueTask(bounty)
      setRescueStep(2)
      showToast('成果已写入假后端，等待验收')
    })()
  })

  $('#requestRescueRevision')?.addEventListener('click', () => {
    void (async () => {
      if (!activeRescueId) return
      const result = await run('退回修改', () => designBackend.requestRevision(activeRescueId!))
      if (!result) return
      setRescueStep(1)
      showToast('已退回修改')
    })()
  })

  $('#approveRescueWork')?.addEventListener('click', () => {
    void (async () => {
      if (!activeRescueId) return
      const result = await run('验收支付', () => designBackend.approveAndPay(activeRescueId!))
      if (!result) return
      const bounty = result.bounties.find((item) => item.id === activeRescueId)
      if (bounty) fillRescueTask(bounty)
      setRescueStep(3)
      showToast('验收通过，奖励已支付到救场者余额')
    })()
  })

  $('#replayRescueFlow')?.addEventListener('click', () => {
    showToast('如需重跑请点击右上角钱包旁的重置（开发中可用控制台 reset）')
    setRescueStep(0)
  })

  // —— Scene switch + wallet ——
  document.querySelectorAll<HTMLElement>('[data-demo-scene]').forEach((button) => {
    button.addEventListener('click', () => {
      const scene = button.dataset.demoScene === 'travel' ? 'travel' : 'hackathon'
      void run('切换场景', () => designBackend.setScene(scene)).then((result) => {
        if (result) showToast(`已切换到${scene === 'travel' ? '旅行' : '黑客松'}演示数据`)
      })
    })
  })

  $('#walletButton')?.addEventListener('click', () => {
    void (async () => {
      if (snapshot?.wallet.isConnected) {
        const accounts = await contractService.getAccounts()
        const currentId = snapshot.wallet.account?.id
        const order = ['caro', 'builder-07', 'yunn']
        const next = order[(order.indexOf(currentId ?? 'caro') + 1) % order.length]
        const result = await run('切换账户', () => designBackend.switchAccount(next))
        if (result) {
          const name = accounts.find((a) => a.id === next)?.name ?? next
          showToast(`已切换为 ${name}（假后端账户）`)
        }
        return
      }
      const result = await run('连接钱包', () => designBackend.connectDemoWallet('caro'))
      if (result) showToast('已连接测试钱包 Caro')
    })()
  })

  const navObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (!visible) return
      document.querySelectorAll<HTMLElement>('[data-target]').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.target === visible.target.id)
      })
    },
    { rootMargin: '-20% 0px -55%', threshold: [0.08, 0.25, 0.5] },
  )
  ;['home', 'commitment', 'rescue', 'mechanism'].forEach((id) => {
    const section = document.getElementById(id)
    if (section) navObserver.observe(section)
  })

  // Initial hydrate
  void designBackend.hydrate().then((initial) => {
    snapshot = initial
    renderAll()
  })

  // Double-click brand to reset demo (escape hatch)
  $('.brand')?.addEventListener('dblclick', () => {
    void run('重置 Demo', () => designBackend.resetDemo()).then((result) => {
      if (result) showToast('假后端已重置为初始演示数据')
    })
  })

  return () => {
    timers.forEach((id) => window.clearTimeout(id))
    timers.clear()
    document.removeEventListener('keydown', onKeyDown)
    navObserver.disconnect()
    document.body.classList.remove('modal-open', 'design-busy')
  }
}
