const intro = document.querySelector("#intro");
const introBrand = document.querySelector("#introBrand");
const flock = document.querySelector("#flock");
const app = document.querySelector("#app");
const skipIntro = document.querySelector("#skipIntro");
const enterButton = document.querySelector("#enterButton");
const toast = document.querySelector("#toast");
const promiseModal = document.querySelector("#promiseModal");
const promiseEditor = document.querySelector("#promiseEditor");
const promiseSuccess = document.querySelector("#promiseSuccess");
const projectNameInput = document.querySelector("#projectName");
const deadlineInput = document.querySelector("#promiseDeadline");
const depositInput = document.querySelector("#promiseDeposit");
const memberList = document.querySelector("#memberList");
const customSceneField = document.querySelector("#customSceneField");
const customSceneName = document.querySelector("#customSceneName");
const confirmFlowModal = document.querySelector("#confirmFlowModal");
const confirmFlowDialog = confirmFlowModal.querySelector(".confirm-flow-dialog");
const confirmMemberList = document.querySelector("#confirmMemberList");
const exitFlowModal = document.querySelector("#exitFlowModal");
const exitFlowDialog = exitFlowModal.querySelector(".exit-flow-dialog");
const exitMemberOptions = document.querySelector("#exitMemberOptions");
const rescueFlowModal = document.querySelector("#rescueFlowModal");
const rescueFlowDialog = rescueFlowModal.querySelector(".rescue-flow-dialog");
const ticketList = document.querySelector("#ticketList");
let activeRescueTicket = null;
let rescueFlowOrigin = null;
let exitFlowOrigin = null;
let confirmFlowOrigin = null;

const pigeonSettings = [
  { pose: "up", top: "10%", delay: "0s", duration: "2.62s", size: "96px", scale: 0.82, rotate: "-5deg" },
  { pose: "down", top: "27%", delay: "0.14s", duration: "2.86s", size: "132px", scale: 1.06, rotate: "2deg" },
  { pose: "up", top: "68%", delay: "0.2s", duration: "2.7s", size: "110px", scale: 0.93, rotate: "-3deg" },
  { pose: "down", top: "46%", delay: "0.38s", duration: "2.95s", size: "88px", scale: 0.77, rotate: "4deg" },
  { pose: "up", top: "82%", delay: "0.44s", duration: "2.58s", size: "122px", scale: 1, rotate: "-4deg" },
  { pose: "down", top: "5%", delay: "0.64s", duration: "2.9s", size: "82px", scale: 0.7, rotate: "3deg" },
  { pose: "up", top: "56%", delay: "0.72s", duration: "2.82s", size: "140px", scale: 1.12, rotate: "1deg" },
  { pose: "down", top: "36%", delay: "0.83s", duration: "2.75s", size: "72px", scale: 0.64, rotate: "-2deg" }
];

flock.innerHTML = pigeonSettings
  .map(
    (pigeon) => `
      <div class="flying-pigeon" style="--top:${pigeon.top};--delay:${pigeon.delay};--duration:${pigeon.duration};--size:${pigeon.size};--scale:${pigeon.scale};--rotate:${pigeon.rotate}">
        <svg viewBox="0 0 180 112"><use href="#flying-pigeon-${pigeon.pose}"></use></svg>
      </div>`
  )
  .join("");

let introClosed = false;
let toastTimer;

function closeIntro() {
  if (introClosed) return;
  introClosed = true;
  intro.classList.add("is-hidden");
  app.classList.add("is-ready");
  app.setAttribute("aria-hidden", "false");
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2300);
}

window.setTimeout(() => introBrand.classList.add("is-logo-visible"), 2450);
window.setTimeout(() => introBrand.classList.add("is-copy-visible"), 3250);
const autoEnter = window.setTimeout(closeIntro, 6400);

[skipIntro, enterButton].forEach((button) => {
  button.addEventListener("click", () => {
    window.clearTimeout(autoEnter);
    closeIntro();
  });
});

function scrollToSection(id) {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

document.querySelectorAll("[data-target]").forEach((button) => {
  button.addEventListener("click", () => scrollToSection(button.dataset.target));
});

document.querySelectorAll("[data-scroll]").forEach((button) => {
  button.addEventListener("click", () => scrollToSection(button.dataset.scroll));
});

function updateMemberNumbers() {
  const rows = [...memberList.querySelectorAll(".member-row")];
  rows.forEach((row, index) => {
    row.querySelector(".member-tag").textContent = String(index + 1).padStart(2, "0");
  });
  document.querySelector("#previewMembers").textContent = `${rows.length} 人`;
}

function updatePromisePreview() {
  const projectName = projectNameInput.value.trim() || "还没写名字的承诺";
  const deadline = deadlineInput.value ? deadlineInput.value.replaceAll("-", ".") : "待确定";
  const deposit = depositInput.value || "0";

  document.querySelector("#previewTitle").textContent = projectName;
  document.querySelector("#previewDeadline").textContent = deadline;
  document.querySelector("#previewDeposit").textContent = deposit;
  document.querySelector("#successProjectName").textContent = projectName;
  updateMemberNumbers();
}

function showPromiseEditor() {
  promiseEditor.hidden = false;
  promiseSuccess.hidden = true;
}

function openPromiseModal() {
  showPromiseEditor();
  updatePromisePreview();
  promiseModal.classList.add("is-open");
  promiseModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  window.setTimeout(() => document.querySelector("#closePromiseModal").focus(), 60);
}

function closePromiseModal() {
  promiseModal.classList.remove("is-open");
  promiseModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  document.querySelector("#promiseButton").focus();
}

document.querySelector("#promiseButton").addEventListener("click", openPromiseModal);
document.querySelector("#closePromiseModal").addEventListener("click", closePromiseModal);
document.querySelector("#promiseBackdrop").addEventListener("click", closePromiseModal);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && promiseModal.classList.contains("is-open")) closePromiseModal();
  if (event.key === "Escape" && confirmFlowModal.classList.contains("is-open")) closeConfirmFlow();
  if (event.key === "Escape" && exitFlowModal.classList.contains("is-open")) closeExitFlow();
  if (event.key === "Escape" && rescueFlowModal.classList.contains("is-open")) closeRescueFlow();
});

const scenePresets = {
  hackathon: {
    label: "黑客松团队",
    name: "Monad 黑客松作品开发",
    deadline: "2026-08-09",
    deposit: "100",
    members: [
      ["Caro", "产品与前端 Demo"],
      ["Lin", "智能合约与测试"]
    ]
  },
  travel: {
    label: "朋友旅行",
    name: "周末海边旅行计划",
    deadline: "2026-08-16",
    deposit: "50",
    members: [
      ["Caro", "整理行程与酒店信息"],
      ["Mia", "确认车票与集合时间"]
    ]
  },
  custom: {
    label: "我的多人计划",
    name: "",
    deadline: "",
    deposit: "0",
    members: [
      ["Caro", "待分配任务"],
      ["新成员", "待分配任务"]
    ]
  }
};

function memberRowTemplate(name, task) {
  return `
    <div class="member-row">
      <span class="member-tag">00</span>
      <label><span>成员</span><input class="member-name" type="text" value="${name}" /></label>
      <label><span>负责的承诺</span><input class="member-task" type="text" value="${task}" /></label>
      <button class="remove-member" type="button" aria-label="移除成员">×</button>
    </div>`;
}

document.querySelectorAll(".scene-option").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".scene-option").forEach((item) => item.classList.remove("is-selected"));
    button.classList.add("is-selected");

    const preset = scenePresets[button.dataset.scene];
    const isCustomScene = button.dataset.scene === "custom";
    customSceneField.hidden = !isCustomScene;
    projectNameInput.value = preset.name;
    deadlineInput.value = preset.deadline;
    depositInput.value = preset.deposit;
    memberList.innerHTML = preset.members.map(([name, task]) => memberRowTemplate(name, task)).join("");
    document.querySelector("#previewScene").textContent = isCustomScene
      ? customSceneName.value.trim() || "自定义场景"
      : preset.label;
    updatePromisePreview();

    if (isCustomScene) window.setTimeout(() => customSceneName.select(), 60);
  });
});

customSceneName.addEventListener("input", () => {
  const customOption = document.querySelector('.scene-option[data-scene="custom"]');
  if (!customOption.classList.contains("is-selected")) return;
  document.querySelector("#previewScene").textContent = customSceneName.value.trim() || "自定义场景";
});

[projectNameInput, deadlineInput, depositInput].forEach((input) => {
  input.addEventListener("input", updatePromisePreview);
});

memberList.addEventListener("input", updatePromisePreview);

memberList.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".remove-member");
  if (!removeButton) return;
  if (memberList.querySelectorAll(".member-row").length === 1) {
    showToast("至少留下一位承诺成员");
    return;
  }
  removeButton.closest(".member-row").remove();
  updatePromisePreview();
});

document.querySelector("#addMemberButton").addEventListener("click", () => {
  memberList.insertAdjacentHTML("beforeend", memberRowTemplate("新成员", "待分配任务"));
  updatePromisePreview();
  memberList.lastElementChild.querySelector(".member-name").select();
});

document.querySelector("#saveDraftButton").addEventListener("click", () => {
  updatePromisePreview();
  showToast("草稿已保存 · 这是界面演示状态");
});

document.querySelector("#sendPromiseButton").addEventListener("click", () => {
  if (!projectNameInput.value.trim()) {
    projectNameInput.focus();
    showToast("先给这份承诺写一个名字");
    return;
  }
  if (!document.querySelector("#promiseRule").checked) {
    showToast("请先确认退出与救场规则");
    return;
  }

  updatePromisePreview();
  promiseEditor.hidden = true;
  promiseSuccess.hidden = false;
  promiseModal.querySelector(".promise-dialog").scrollTop = 0;
});

document.querySelector("#makeAnotherPromise").addEventListener("click", () => {
  showPromiseEditor();
  promiseModal.querySelector(".promise-dialog").scrollTop = 0;
});

document.querySelector("#viewPromiseCard").addEventListener("click", () => {
  closePromiseModal();
  window.setTimeout(() => openConfirmFlow(document.querySelector("#openConfirmFlow")), 180);
});

const demoScenarios = {
  hackathon: {
    eyebrow: "MY PROMISE · 001",
    workspaceDescription: "一张承诺卡，记下成员、任务与每一笔保证金的去向。",
    label: "黑客松项目",
    title: "Monad 黑客松作品开发",
    summary: "成员共同完成产品、前端和合约 Demo。当前有一名成员退出，保证金已转入救场池。",
    members: "5 人",
    deposit: "100 MON",
    stage: "Demo 开发",
    timeline: ["承诺已确认", "1 人退出", "救场悬赏已发布", "等待验收与结算"],
    fund: "100",
    fundLines: ["退出成员的保证金", "已进入救场池"],
    confirmationMembers: [
      ["Caro", "产品与前端 Demo"],
      ["Lin", "智能合约与测试"],
      ["Kai", "智能合约开发"],
      ["Mia", "视觉设计与测试"],
      ["Rui", "调研与演示材料"]
    ],
    exitMembers: [
      ["Kai", "智能合约开发"],
      ["Caro", "产品与前端 Demo"],
      ["Lin", "测试与验收"]
    ],
    rescueEyebrow: "RESCUE BOARD · HACKATHON",
    rescueDescription: "选择一张任务票，补上团队留下的开发缺口。",
    tickets: [
      {
        title: "紧急完成智能合约 MVP",
        category: "开发 · 黑客松",
        summary: "提交代码仓库，等待团队验收",
        reward: "80",
        deadline: "08 月 08 日 · 22:00",
        proof: "GitHub 仓库与部署说明",
        proofSummary: "代码仓库 · 部署说明 · 运行截图",
        copy: "队友退出后留下了合约开发缺口。领取后，请在截止时间前完成核心逻辑并提交可运行成果。",
        checks: ["完成保证金、退出与救场池逻辑", "补齐悬赏领取、提交与验收状态", "提交代码仓库和简短运行说明"],
        workLink: "https://github.com/Gos0lis/dont-ghost-me",
        workNote: "已补齐核心合约逻辑与部署说明，请按交付清单验收。"
      },
      {
        title: "整理代码交接与部署说明",
        category: "文档 · 黑客松",
        summary: "补充必要文件与运行步骤",
        reward: "20",
        deadline: "08 月 09 日 · 12:00",
        proof: "交接文档与运行截图",
        proofSummary: "交接文档 · 运行步骤 · 演示截图",
        copy: "退出成员留下的代码缺少交接信息。领取后，请把运行方式、必要文件和部署步骤整理清楚。",
        checks: ["确认现有仓库可以正常运行", "补齐环境配置和部署步骤", "提交交接文档与演示截图"],
        workLink: "https://github.com/Gos0lis/dont-ghost-me",
        workNote: "已整理运行环境、部署步骤和必要文件，请按交付清单验收。"
      }
    ]
  },
  travel: {
    eyebrow: "MY PROMISE · 002",
    workspaceDescription: "同一张承诺卡，也可以记下旅行成员、共同费用和临时退出后的补救安排。",
    label: "朋友旅行",
    title: "周末海边旅行计划",
    summary: "四位朋友已经确认车票和酒店。一名成员临时退出，其保证金被拆成三张补救票。",
    members: "4 人",
    deposit: "50 MON",
    stage: "行程确认",
    timeline: ["旅行承诺已确认", "1 人临时退出", "3 张补救票已发布", "等待行程重新确认"],
    fund: "50",
    fundLines: ["退出成员的保证金", "被拆成三项补救悬赏"],
    confirmationMembers: [
      ["Caro", "酒店与预算"],
      ["Mia", "票务与行程协调"],
      ["Lin", "交通与集合安排"],
      ["Kai", "活动与餐厅预订"]
    ],
    exitMembers: [
      ["Mia", "票务与行程协调"],
      ["Caro", "酒店与预算"],
      ["Lin", "交通与集合安排"]
    ],
    rescueEyebrow: "RESCUE BOARD · TRAVEL",
    rescueDescription: "找替补、处理门票和修改酒店，每个麻烦都对应一张救场票。",
    tickets: [
      {
        title: "寻找可以同行的旅行替补",
        category: "协调 · 朋友旅行",
        summary: "确认日期、预算和费用交接",
        reward: "20",
        deadline: "08 月 15 日 · 18:00",
        proof: "替补确认记录与费用交接",
        proofSummary: "替补确认 · 群聊记录 · 费用交接",
        copy: "一名朋友临时退出，原来的房间和行程留下空位。请找到合适的替补，并完成信息与费用交接。",
        checks: ["确认替补可以参加完整行程", "说明预算、集合时间和共同规则", "在旅行群完成成员与费用交接"],
        workLink: "https://example.com/travel-replacement-proof",
        workNote: "替补成员已经确认日期和预算，费用与群聊信息已完成交接。"
      },
      {
        title: "转卖临时空出的活动门票",
        category: "票务 · 朋友旅行",
        summary: "发布转让信息并完成收款",
        reward: "15",
        deadline: "08 月 16 日 · 12:00",
        proof: "转卖记录与收款凭证",
        proofSummary: "转让页面 · 沟通记录 · 收款凭证",
        copy: "退出成员已经购买活动门票。请发布真实转让信息，找到接手者并把处理结果同步给团队。",
        checks: ["核对票面信息与可转让规则", "完成买家沟通和票务交接", "提交转让记录与收款凭证"],
        workLink: "https://example.com/ticket-transfer-proof",
        workNote: "活动门票已经完成转让，买家确认收到票务信息，收款记录已附上。"
      },
      {
        title: "修改酒店入住人与行程",
        category: "行程 · 朋友旅行",
        summary: "联系酒店并同步新安排",
        reward: "15",
        deadline: "08 月 16 日 · 20:00",
        proof: "酒店修改确认与新行程",
        proofSummary: "酒店确认 · 新入住人 · 更新行程",
        copy: "成员变化后，酒店入住人与集合安排需要同步修改。请联系酒店并把新的行程发给所有成员。",
        checks: ["确认酒店允许修改入住信息", "更新入住人、房型与费用分配", "把新行程同步给全部成员"],
        workLink: "https://example.com/hotel-change-proof",
        workNote: "酒店已确认修改入住人，费用和集合时间也已经同步给全部成员。"
      }
    ]
  }
};

function ticketTemplate(task, index) {
  return `
    <button class="rescue-ticket" type="button"
      data-task="${task.title}"
      data-reward="${task.reward}"
      data-category="${task.category}"
      data-deadline="${task.deadline}"
      data-proof="${task.proof}"
      data-proof-summary="${task.proofSummary}"
      data-copy="${task.copy}"
      data-check-one="${task.checks[0]}"
      data-check-two="${task.checks[1]}"
      data-check-three="${task.checks[2]}"
      data-work-link="${task.workLink}"
      data-work-note="${task.workNote}">
      <span class="ticket-number">NO. ${String(index + 1).padStart(2, "0")}</span>
      <span class="ticket-copy">
        <small>${task.category}</small>
        <strong>${task.title}</strong>
        <em>${task.summary}</em>
      </span>
      <span class="ticket-reward"><b>${task.reward}</b> MON</span>
      <span class="ticket-status">待领取</span>
    </button>`;
}

function applyDemoScenario(sceneKey, announce = true) {
  const scene = demoScenarios[sceneKey];
  document.querySelector("#commitment").dataset.scene = sceneKey;
  document.querySelector("#workspaceEyebrow").textContent = scene.eyebrow;
  document.querySelector("#workspaceDescription").textContent = scene.workspaceDescription;
  document.querySelector("#projectSceneLabel").textContent = scene.label;
  document.querySelector("#projectCardTitle").textContent = scene.title;
  document.querySelector("#projectSummary").textContent = scene.summary;
  document.querySelector("#projectMemberCount").textContent = scene.members;
  document.querySelector("#projectDeposit").textContent = scene.deposit;
  document.querySelector("#projectStage").textContent = scene.stage;
  ["#timelineOne", "#timelineTwo", "#timelineThree", "#timelineFour"].forEach((selector, index) => {
    document.querySelector(selector).textContent = scene.timeline[index];
  });
  document.querySelector("#fundAmount").textContent = scene.fund;
  document.querySelector("#fundDescription").innerHTML = `${scene.fundLines[0]}<br />${scene.fundLines[1]}`;
  document.querySelector("#rescueBoardEyebrow").textContent = scene.rescueEyebrow;
  document.querySelector("#rescueBoardDescription").textContent = scene.rescueDescription;
  ticketList.innerHTML = scene.tickets.map(ticketTemplate).join("");

  document.querySelectorAll("[data-demo-scene]").forEach((button) => {
    const selected = button.dataset.demoScene === sceneKey;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  });

  if (announce) showToast(`已切换到${scene.label}演示`);
}

function confirmMemberTemplate(member, index) {
  const [name, task] = member;
  return `
    <button class="confirm-member-card${index === 0 ? " is-selected" : ""}" type="button" data-index="${index}" data-name="${name}" data-task="${task}">
      <i>${String(index + 1).padStart(2, "0")}</i>
      <span><strong>${name}</strong><small>${task}</small></span>
      <em>待确认</em>
    </button>`;
}

function selectConfirmMember(card) {
  if (!card || card.classList.contains("is-signed")) return;
  confirmMemberList.querySelectorAll(".confirm-member-card").forEach((item) => {
    item.classList.toggle("is-selected", item === card);
  });
  document.querySelector("#currentSignerNumber").textContent = String(Number(card.dataset.index) + 1).padStart(2, "0");
  document.querySelector("#currentSignerName").textContent = card.dataset.name;
  document.querySelector("#currentSignerTask").textContent = card.dataset.task;
}

function fillConfirmFlow(scene) {
  const memberCount = scene.confirmationMembers.length;
  const totalLocked = Number(scene.fund) * memberCount;
  document.querySelector("#confirmSceneName").textContent = scene.label;
  document.querySelector("#confirmProjectName").textContent = scene.title;
  document.querySelector("#confirmMemberTotal").textContent = `${memberCount} 人`;
  ["#confirmPerDeposit", "#signerDeposit", "#confirmedPerDeposit"].forEach((selector) => {
    document.querySelector(selector).textContent = scene.fund;
  });
  document.querySelector("#confirmedTotalDeposit").textContent = totalLocked;
  document.querySelector("#confirmedMemberCount").textContent = `0 / ${memberCount}`;
  confirmMemberList.innerHTML = scene.confirmationMembers.map(confirmMemberTemplate).join("");
  selectConfirmMember(confirmMemberList.querySelector(".confirm-member-card"));
}

function setConfirmStep(step) {
  confirmFlowModal.querySelectorAll("[data-confirm-panel]").forEach((panel) => {
    panel.hidden = Number(panel.dataset.confirmPanel) !== step;
  });
  confirmFlowModal.querySelectorAll("[data-confirm-step]").forEach((item) => {
    const itemStep = Number(item.dataset.confirmStep);
    item.classList.toggle("is-current", itemStep === step);
    item.classList.toggle("is-done", itemStep < step);
  });
  confirmFlowDialog.scrollTop = 0;
}

function openConfirmFlow(origin) {
  const sceneKey = document.querySelector("#commitment").dataset.scene || "hackathon";
  fillConfirmFlow(demoScenarios[sceneKey]);
  setConfirmStep(0);
  confirmFlowOrigin = origin;
  confirmFlowModal.classList.add("is-open");
  confirmFlowModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  window.setTimeout(() => document.querySelector("#closeConfirmFlow").focus(), 60);
}

function closeConfirmFlow() {
  confirmFlowModal.classList.remove("is-open");
  confirmFlowModal.setAttribute("aria-hidden", "true");
  if (!promiseModal.classList.contains("is-open") && !exitFlowModal.classList.contains("is-open") && !rescueFlowModal.classList.contains("is-open")) {
    document.body.classList.remove("modal-open");
  }
  if (confirmFlowOrigin) confirmFlowOrigin.focus();
}

document.querySelector("#openConfirmFlow").addEventListener("click", (event) => openConfirmFlow(event.currentTarget));
document.querySelector("#closeConfirmFlow").addEventListener("click", closeConfirmFlow);
document.querySelector("#confirmFlowBackdrop").addEventListener("click", closeConfirmFlow);
document.querySelector("#cancelConfirmFlow").addEventListener("click", closeConfirmFlow);
document.querySelector("#reviewConfirmMembers").addEventListener("click", () => setConfirmStep(1));
document.querySelector("#backToPromiseInvite").addEventListener("click", () => setConfirmStep(0));

confirmMemberList.addEventListener("click", (event) => {
  const card = event.target.closest(".confirm-member-card");
  if (!card) return;
  if (card.classList.contains("is-signed")) {
    showToast(`${card.dataset.name} 已经确认过了`);
    return;
  }
  selectConfirmMember(card);
});

document.querySelector("#confirmCurrentMember").addEventListener("click", () => {
  const currentCard = confirmMemberList.querySelector(".confirm-member-card.is-selected");
  if (!currentCard) return;
  currentCard.classList.remove("is-selected");
  currentCard.classList.add("is-signed");
  currentCard.querySelector("em").textContent = "已确认";

  const cards = [...confirmMemberList.querySelectorAll(".confirm-member-card")];
  const signedCount = cards.filter((card) => card.classList.contains("is-signed")).length;
  document.querySelector("#confirmedMemberCount").textContent = `${signedCount} / ${cards.length}`;
  const nextCard = cards.find((card) => !card.classList.contains("is-signed"));

  if (nextCard) {
    selectConfirmMember(nextCard);
    showToast(`${currentCard.dataset.name} 已确认，切换到下一位成员`);
    return;
  }

  setConfirmStep(2);
  showToast("所有成员都已确认，模拟保证金锁定完成");
});

document.querySelector("#restartConfirmFlow").addEventListener("click", () => {
  const sceneKey = document.querySelector("#commitment").dataset.scene || "hackathon";
  fillConfirmFlow(demoScenarios[sceneKey]);
  setConfirmStep(0);
});

document.querySelector("#finishConfirmFlow").addEventListener("click", () => {
  closeConfirmFlow();
  window.setTimeout(() => scrollToSection("commitment"), 120);
});

function exitMemberTemplate(member, index) {
  const [name, role] = member;
  return `
    <button class="exit-member-option${index === 0 ? " is-selected" : ""}" type="button" data-name="${name}" data-role="${role}">
      <i>${String(index + 1).padStart(2, "0")}</i>
      <span><strong>${name}</strong><small>${role}</small></span>
      <em aria-hidden="true"></em>
    </button>`;
}

function selectExitMember(option) {
  exitMemberOptions.querySelectorAll(".exit-member-option").forEach((item) => {
    item.classList.toggle("is-selected", item === option);
  });
  document.querySelector("#exitingMemberName").textContent = option.dataset.name;
  document.querySelector("#exitingMemberRole").textContent = `原负责：${option.dataset.role}`;
  document.querySelector("#exitReceiptMember").textContent = option.dataset.name;
}

function fillExitFlow(scene) {
  const depositTargets = ["#exitDepositAmount", "#exitPoolAmount", "#exitReceiptAmount"];
  depositTargets.forEach((selector) => {
    document.querySelector(selector).textContent = scene.fund;
  });

  exitMemberOptions.innerHTML = scene.exitMembers.map(exitMemberTemplate).join("");
  document.querySelector("#exitTaskList").innerHTML = scene.tickets
    .map(
      (task) => `
        <div class="exit-task-slip">
          <span><strong>${task.title}</strong><small>${task.category}</small></span>
          <b>${task.reward} MON</b>
        </div>`
    )
    .join("");
  document.querySelector("#exitReceiptTickets").textContent = `${scene.tickets.length} 张`;
  selectExitMember(exitMemberOptions.querySelector(".exit-member-option"));
}

function setExitStep(step) {
  exitFlowModal.querySelectorAll("[data-exit-panel]").forEach((panel) => {
    panel.hidden = Number(panel.dataset.exitPanel) !== step;
  });
  exitFlowModal.querySelectorAll("[data-exit-step]").forEach((item) => {
    const itemStep = Number(item.dataset.exitStep);
    item.classList.toggle("is-current", itemStep === step);
    item.classList.toggle("is-done", itemStep < step);
  });
  exitFlowDialog.scrollTop = 0;
}

function openExitFlow(origin) {
  const sceneKey = document.querySelector("#commitment").dataset.scene || "hackathon";
  fillExitFlow(demoScenarios[sceneKey]);
  setExitStep(0);
  exitFlowOrigin = origin;
  exitFlowModal.classList.add("is-open");
  exitFlowModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  window.setTimeout(() => document.querySelector("#closeExitFlow").focus(), 60);
}

function closeExitFlow() {
  exitFlowModal.classList.remove("is-open");
  exitFlowModal.setAttribute("aria-hidden", "true");
  if (!promiseModal.classList.contains("is-open") && !confirmFlowModal.classList.contains("is-open") && !rescueFlowModal.classList.contains("is-open")) {
    document.body.classList.remove("modal-open");
  }
  if (exitFlowOrigin) exitFlowOrigin.focus();
}

document.querySelector("#openExitFlow").addEventListener("click", (event) => openExitFlow(event.currentTarget));
document.querySelector("#closeExitFlow").addEventListener("click", closeExitFlow);
document.querySelector("#exitFlowBackdrop").addEventListener("click", closeExitFlow);
document.querySelector("#cancelExitFlow").addEventListener("click", closeExitFlow);
document.querySelector("#continueExitFlow").addEventListener("click", () => setExitStep(1));
document.querySelector("#backToExitMember").addEventListener("click", () => setExitStep(0));

exitMemberOptions.addEventListener("click", (event) => {
  const option = event.target.closest(".exit-member-option");
  if (option) selectExitMember(option);
});

document.querySelector("#confirmExitTransfer").addEventListener("click", () => {
  if (!document.querySelector("#exitConfirmRule").checked) {
    showToast("请先确认保证金的救场用途");
    return;
  }
  setExitStep(2);
  showToast("退出已确认，救场票已经生成");
});

document.querySelector("#finishExitFlow").addEventListener("click", closeExitFlow);
document.querySelector("#viewGeneratedRescueTickets").addEventListener("click", () => {
  closeExitFlow();
  window.setTimeout(() => scrollToSection("rescue"), 120);
});

function rescueTaskFromTicket(ticket) {
  return {
    title: ticket.dataset.task,
    reward: ticket.dataset.reward,
    category: ticket.dataset.category,
    deadline: ticket.dataset.deadline,
    proof: ticket.dataset.proof,
    proofSummary: ticket.dataset.proofSummary,
    copy: ticket.dataset.copy,
    checks: [ticket.dataset.checkOne, ticket.dataset.checkTwo, ticket.dataset.checkThree],
    workLink: ticket.dataset.workLink,
    workNote: ticket.dataset.workNote
  };
}

function fillRescueTask(task) {
  ["#rescueFlowTitle", "#rescueDetailTitle", "#claimedTaskName", "#paidTaskName"].forEach((selector) => {
    document.querySelector(selector).textContent = task.title;
  });
  ["#rescueReward", "#claimedReward", "#paidReward"].forEach((selector) => {
    document.querySelector(selector).textContent = task.reward;
  });
  document.querySelector("#rescueFlowCategory").textContent = task.category;
  document.querySelector("#rescueDeadline").textContent = task.deadline;
  document.querySelector("#rescueProof").textContent = task.proof;
  document.querySelector("#rescueTaskCopy").textContent = task.copy;
  document.querySelector("#rescueCheckOne").textContent = task.checks[0];
  document.querySelector("#rescueCheckTwo").textContent = task.checks[1];
  document.querySelector("#rescueCheckThree").textContent = task.checks[2];
  document.querySelector("#submissionProofSummary").textContent = task.proofSummary;
  document.querySelector("#rescueWorkLink").value = task.workLink;
  document.querySelector("#rescueWorkNote").value = task.workNote;
}

function setRescueStep(step) {
  rescueFlowModal.querySelectorAll("[data-rescue-panel]").forEach((panel) => {
    panel.hidden = Number(panel.dataset.rescuePanel) !== step;
  });

  rescueFlowModal.querySelectorAll("[data-rescue-step]").forEach((item) => {
    const itemStep = Number(item.dataset.rescueStep);
    item.classList.toggle("is-current", itemStep === step);
    item.classList.toggle("is-done", itemStep < step);
  });

  rescueFlowDialog.scrollTop = 0;
}

function openRescueFlow(ticket, origin) {
  activeRescueTicket = ticket;
  rescueFlowOrigin = origin || ticket;
  fillRescueTask(rescueTaskFromTicket(ticket));
  setRescueStep(0);
  rescueFlowModal.classList.add("is-open");
  rescueFlowModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  window.setTimeout(() => document.querySelector("#closeRescueFlow").focus(), 60);
}

function closeRescueFlow() {
  rescueFlowModal.classList.remove("is-open");
  rescueFlowModal.setAttribute("aria-hidden", "true");
  if (!promiseModal.classList.contains("is-open") && !confirmFlowModal.classList.contains("is-open") && !exitFlowModal.classList.contains("is-open")) {
    document.body.classList.remove("modal-open");
  }
  if (rescueFlowOrigin) rescueFlowOrigin.focus();
}

document.querySelector("#closeRescueFlow").addEventListener("click", closeRescueFlow);
document.querySelector("#rescueFlowBackdrop").addEventListener("click", closeRescueFlow);

document.querySelector("#rescueButton").addEventListener("click", (event) => {
  const firstTicket = document.querySelector(".rescue-ticket");
  openRescueFlow(firstTicket, event.currentTarget);
});

document.querySelector("#walletButton").addEventListener("click", (event) => {
  event.currentTarget.classList.toggle("is-connected");
  showToast("当前使用测试钱包，不涉及真实资金");
});

ticketList.addEventListener("click", (event) => {
  const ticket = event.target.closest(".rescue-ticket");
  if (!ticket) return;
  document.querySelectorAll(".rescue-ticket").forEach((item) => item.classList.remove("is-selected"));
  ticket.classList.add("is-selected");
  openRescueFlow(ticket, ticket);
});

document.querySelectorAll("[data-demo-scene]").forEach((button) => {
  button.addEventListener("click", () => applyDemoScenario(button.dataset.demoScene));
});

applyDemoScenario("hackathon", false);

document.querySelector("#backToRescueHall").addEventListener("click", () => {
  closeRescueFlow();
  window.setTimeout(() => scrollToSection("rescue"), 120);
});

document.querySelector("#claimRescueTask").addEventListener("click", () => {
  if (activeRescueTicket) activeRescueTicket.querySelector(".ticket-status").textContent = "已领取";
  setRescueStep(1);
});

document.querySelector("#returnToTaskDetail").addEventListener("click", () => setRescueStep(0));

document.querySelector("#submitRescueWork").addEventListener("click", () => {
  const linkInput = document.querySelector("#rescueWorkLink");
  const noteInput = document.querySelector("#rescueWorkNote");
  if (!linkInput.value.trim()) {
    linkInput.focus();
    showToast("先放入一个可以验收的成果链接");
    return;
  }

  document.querySelector("#reviewWorkLink").textContent = linkInput.value.trim().replace(/^https?:\/\//, "");
  document.querySelector("#reviewWorkNote").textContent = noteInput.value.trim() || "已提交成果，等待负责人验收。";
  if (activeRescueTicket) activeRescueTicket.querySelector(".ticket-status").textContent = "待验收";
  setRescueStep(2);
});

document.querySelector("#requestRescueRevision").addEventListener("click", () => {
  setRescueStep(1);
  showToast("验收人已退回修改，交付说明保留不变");
});

document.querySelector("#approveRescueWork").addEventListener("click", () => {
  if (activeRescueTicket) {
    activeRescueTicket.classList.add("is-completed");
    activeRescueTicket.querySelector(".ticket-status").textContent = "已完成";
  }
  setRescueStep(3);
});

document.querySelector("#replayRescueFlow").addEventListener("click", () => {
  if (activeRescueTicket) {
    activeRescueTicket.classList.remove("is-completed");
    activeRescueTicket.querySelector(".ticket-status").textContent = "待领取";
  }
  setRescueStep(0);
});

document.querySelector("#finishRescueFlow").addEventListener("click", () => {
  closeRescueFlow();
  window.setTimeout(() => scrollToSection("rescue"), 120);
  showToast("救场流程演示完成");
});

const observedSections = ["home", "commitment", "rescue", "mechanism"]
  .map((id) => document.getElementById(id))
  .filter(Boolean);

const navObserver = new IntersectionObserver(
  (entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

    if (!visible) return;
    document.querySelectorAll("[data-target]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.target === visible.target.id);
    });
  },
  { rootMargin: "-20% 0px -55%", threshold: [0.08, 0.25, 0.5] }
);

observedSections.forEach((section) => navObserver.observe(section));

if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  introBrand.classList.add("is-logo-visible", "is-copy-visible");
  window.clearTimeout(autoEnter);
  window.setTimeout(closeIntro, 900);
}
