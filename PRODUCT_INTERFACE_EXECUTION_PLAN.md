# 不要鸽我：产品接口修改执行方案

> 依据：`PRODUCT_INTERFACE_AUDIT.md`（2026-08-06）  
> 目标：先稳住 mock 展示，再把 local（Anvil）打到可验收联调标准；暂不接真实公链。  
> 原则：一次只修一类语义；每阶段可独立验证；提交按审计第 10 节拆分。

---

## 0. 范围与约束

| 项 | 决定 |
| --- | --- |
| 默认环境 | `VITE_CHAIN_MODE=mock`（产品展示） |
| 联调环境 | `local`（Anvil）；完成 P0/P1 后再用 |
| 公链 | 暂不启用 `chain` / Monad |
| 产品闭环 | local 仅支持「新建 2～3 人项目 → 加入 → 退出出票 → 救场」 |
| 不做 | 驱逐投票、项目最终结算、放弃悬赏、真实钱包、IPFS（本轮） |
| 不删 | `pages/**`、`components/**`、旧 store（完成本地链对齐后再定） |

---

## 1. 阶段总览

```text
A 收敛配置与范围
  → B 修复 P0（阻断主流程）
  → C 统一业务语义（P1 核心）
  → D 状态/文案对齐（P2）
  → E Anvil 端到端验收
  → F 清理与文档
```

每阶段结束后：mock 演示仍可用；local 逐步接近验收清单（审计 §8）。

---

## 2. 阶段 A：收敛范围与配置（约 0.5 天）

### 目标

把运行模式、环境变量和“local 最小闭环”写清楚，避免联调时误用公链或超范围功能。

### 任务

| ID | 任务 | 文件 | 完成标准 |
| --- | --- | --- | --- |
| A1 | 确认默认模式为 mock；local 仅联调 | `frontend/.env.example`、文档 | `.env.example` 含 `VITE_CHAIN_MODE`、RPC、合约地址说明；`.env.local` 不提交 |
| A2 | local 产品范围写死为 2～3 人 | 本方案 + README 草稿点 | 文档明确：第 4 人 UI 在 local 禁用或提示 |
| A3 | 接口注释分层（可不拆文件） | `contractService.ts` | 标注：链上写 / 链下元数据 / Demo 控制 |

### 验收

- 新人按 `.env.example` 能区分 mock / local。
- 团队认同：本轮不做驱逐、结算、公链。

### 建议提交

可与审计文档一起：`docs: add frontend-contract interface audit`（若审计尚未提交）。

---

## 3. 阶段 B：修复 P0（阻断 local 主流程）（约 1～1.5 天）

### B1 — 未加入成员 `getMember` 容错

| 项 | 内容 |
| --- | --- |
| 问题 | `readChainProject` 对未 join 地址调用 `getMember` 可能回滚 → hydrate 失败 |
| 文件 | `frontend/src/services/viemContractService.ts` |
| 做法 | 对每个元数据成员：`try/catch` 或先判是否已 join；失败则 `status: invited`，不中断整页 |
| 验收 | 创建项目后立即刷新，页面有 snapshot；未 join 显示 invited |

### B2 — 退出成员状态映射为 `quit`

| 项 | 内容 |
| --- | --- |
| 问题 | 退出后被映射成 `invited` |
| 文件 | `viemContractService.ts`（Member → ProjectMember） |
| 做法 | 用链上 `active` / `withdrawn`（及必要时事件）派生：`active` / `quit` / `invited` |
| 验收 | `leaveProject` 后该成员 UI 为 quit，rescuePool 增加 |

### B3 — local 成员数限制（首选）或补账户

| 项 | 内容 |
| --- | --- |
| 问题 | `LOCAL_DEMO_ACCOUNTS` 仅 3 人，第 4 人易复用地址 → `Already joined` |
| 文件 | `viemContractService.ts`、`designBackend.ts` / `wireDesignToMock.ts`、创建表单相关 |
| 做法（本轮） | local 模式 `members.length <= 3`；UI 隐藏「添加第 4 人」或 toast 拦截 |
| 备选 | 扩展 Anvil 账户映射表（留给 5 人演示迭代） |
| 验收 | local 无法静默创建第 4 人；2～3 人地址与姓名一致 |

### B4 — 保证金与出票总额校验

| 项 | 内容 |
| --- | --- |
| 问题 | 自定义场景 deposit=0 → 合约回滚；票奖励可超过救场池 |
| 文件 | `scenePresets.ts`、`designBackend.ts`（createPromise / quitAndSpawnTickets）、必要时 UI |
| 做法 | ① 自定义默认 deposit 改为正数；② 提交前 `deposit > 0`；③ 出票前 `sum(reward) <= availableRescuePool` |
| 验收 | deposit=0 被前端拦住；超额出票被拦住并提示可用池余额 |

### 建议提交

```text
fix: align local member and project state mapping
```

（B1–B3；B4 可并入或单独见阶段 C 提交）

---

## 4. 阶段 C：统一业务语义（P1 核心）（约 1～1.5 天）

### C1 — join 语义：一笔 `joinProject`

| 项 | 内容 |
| --- | --- |
| 问题 | UI「确认 + 锁定」两步；viem 的 `confirmParticipation` 是假回执，`lockDeposit` 才真正 `joinProject` |
| 文件 | `designBackend.ts`、`viemContractService.ts`、`wireDesignToMock.ts`（文案） |
| 做法 | local：`signMember` / 确认入口只发一笔 `joinProject(msg.value)`；mock 可内部仍分两步，但产品文案统一为「确认并签署」一次动作 |
| 验收 | local 网络面板只有一笔 join；成功后 `getMember.active === true` |

### C2 — 姓名与签名地址一致

| 项 | 内容 |
| --- | --- |
| 文件 | `viemContractService.ts`（创建时 index→账户）、创建表单成员行 |
| 做法 | 创建时按成员下标绑定 `LOCAL_DEMO_ACCOUNTS[i]`；UI 显示名强制来自该表，禁止自由改名导致错位 |
| 验收 | 切换账户后，对应成员可 join，他人不可冒充 |

### C3 — 成果元数据 key 与刷新恢复

| 项 | 内容 |
| --- | --- |
| 问题 | URL/说明仅 localStorage；清 index 易丢 |
| 文件 | `viemContractService.ts`（或独立 metadata helper） |
| 做法 | key = `chainId + contractAddress + projectId/bountyId`；reset 不清无法从链恢复的 submission meta（local 仅清可重建 index） |
| 验收 | 提交成果后刷新，URL/说明仍在（同浏览器） |

### C4 — `resetDemo` 分模式行为

| 模式 | 行为 |
| --- | --- |
| mock | 重建 localStorage 种子（保持现状） |
| local | 清浏览器 index/session + **明确提示**「请重启 Anvil 并重新部署」；不提示「假后端已重置」 |
| chain | 禁止或 no-op + 文案禁止 |

| 文件 | `viemContractService.ts`、`mockContractService.ts`、`wireDesignToMock.ts` |
| 验收 | local 双击重置后文案正确；链上旧项目若 Anvil 未重启仍会扫回（符合预期） |

### C5 — 出票失败可观测（建议本阶段做完）

| 项 | 内容 |
| --- | --- |
| 文件 | `designBackend.quitAndSpawnTickets`、UI toast |
| 做法 | 循环 `createBounty` 记录成功数；失败时展示「已完成 N 笔，失败在第 M 笔」 |
| 验收 | 故意超额或中断时，用户知道部分成功 |

### 建议提交

```text
fix: align join and exit flows with contract semantics
fix: validate deposits and rescue ticket totals
```

（若 B4 未在 B 提交，与校验合并为第二条。）

---

## 5. 阶段 D：状态与展示对齐（P2）（约 0.5～1 天）

### D1 — 悬赏状态映射纠错

| 合约 | 前端（正确） |
| --- | --- |
| Open | `open` |
| Claimed | `claimed` |
| Submitted | `submitted` |
| RevisionRequested | `revision_required` |
| Approved / Paid | `approved` / `paid` |
| Rejected | `rejected`（新增，禁止当成 `approved`） |
| Cancelled | `cancelled`（新增，禁止当成 `open`） |

| 文件 | `types.ts`、`viemContractService.ts`、必要时 UI 徽章文案 |
| 验收 | Rejected/Cancelled 不再显示为 Approved/Open |

### D2 — 项目状态：链上 3 态 + UI 派生

```text
chainStatus: Active | Finished | Cancelled
uiStatus:    awaiting_confirmation | rescue_needed | rescue_in_progress | active_again | ...
```

| 文件 | `types.ts`、`viemContractService.ts` / `designBackend.ts` |
| 做法 | 读合约 status 后，用成员/悬赏派生 UI 态；禁止把派生态写回链 |

### D3 — 币种与场景切换文案

| 项 | 做法 |
| --- | --- |
| 币种 | local 显示与 `chainConfig` 一致（ETH）；不要写死 MON，或按 mode 切换 |
| 场景 | local 不用名称正则作为唯一手段；优先固定 sceneId → 最近创建 projectId 映射（meta） |
| 误导文案 | 去掉 local 下「假后端」类文案 |

### 建议提交

可并入 C 的 fix 提交，或：`fix: correct bounty status mapping and local copy`。

---

## 6. 阶段 E：Anvil 端到端验收（约 0.5 天）

### 前置

1. 启动 Anvil（`8545`）。
2. `forge script script/DontGhostMe.s.sol` 部署。
3. 更新 `frontend/.env.local`：`VITE_CHAIN_MODE=local`、合约地址、RPC。
4. 启动 Vite。

### 脚本化检查清单（对照审计 §8）

| # | 步骤 | 期望 |
| --- | --- | --- |
| 1 | Anvil 关闭时打开页面 | 明确错误，按钮不可无响应挂死 |
| 2 | 创建 2 人项目，保证金 100 | 链上有项目；刷新 hydrate 成功 |
| 3 | 两人分别 join | 地址与姓名一致；状态 active |
| 4 | 一人 leave | 显示 quit；rescuePool = 100 |
| 5 | 出票合计 ≤ 100 | 成功；>100 被拒 |
| 6 | claim → submit → revision/approve | 状态链正确 |
| 7 | 人为 Rejected/Cancelled（若可） | UI 不为 approved/open |
| 8 | 刷新 | 项目/成员/票/成果 meta 可恢复 |
| 9 | mock reset / local reset | 行为符合 C4 |
| 10 | local 文案 | 无「假后端」误导 |

**全部通过后**，才标记「前端已稳定接入本地测试链」。

---

## 7. 阶段 F：清理与文档（约 0.5 天）

> 验收通过后再删；删除前确认无 import。

### F1 — 可安全删除（审计 §9.1）

- `frontend/src/design/initDesignDemo.js` + `.d.ts`
- `frontend/src/contracts/mockAbi.ts`
- `frontend/design-reference/v11/dont-ghost-me-codepen-v11.txt`
- `frontend/design-reference/v11/style.css`、`script.js`（保留 `.html` 归档）

### F2 — Foundry 脚手架成套删除（确认 `DontGhostMe.s.sol` 已入库）

- `src/Counter.sol`
- `test/Counter.t.sol`
- `script/Counter.s.sol`

### F3 — `.gitignore` / 文档

- 确保忽略：`out/`、`cache/`、`broadcast/**/31337/`、`frontend/dist/`、`frontend/.env.local`
- 提交：`frontend/.env.example`
- 更新 README：mock / local 启动步骤、重置差异、3 人上限

### 建议提交

```text
chore: remove obsolete design and Counter scaffolding
docs: document mock and local Anvil workflows
```

---

## 8. 任务依赖与并行

```text
A1–A3 ─────────────────────────────────┐
                                       │
B1 (getMember) ──┬── B2 (quit map) ────┼──→ C1 (join 一笔) ──→ C2 (姓名地址)
B3 (≤3 人) ──────┤                     │         │
B4 (deposit/票) ─┘                     │         ├── C4 (reset)
                                       │         ├── C3 (meta key)
                                       │         └── C5 (出票可观测)
                                       │
                                       └──→ D1–D3（可与 C 后半并行）
                                              │
                                              ▼
                                             E 验收
                                              │
                                              ▼
                                             F 清理文档
```

- **必须先做**：B1（否则 local 创建即挂）。
- **B2 / B3 / B4** 可并行改不同函数，合并前互相跑一遍创建→join→leave。
- **C1 依赖 B1**：join 流程建立在可读成员之上。
- **F 依赖 E**：勿在联调未过时删参考文件。

---

## 9. 文件改动热图（按优先级）

| 优先级 | 文件 | 阶段 |
| --- | --- | --- |
| P0 | `viemContractService.ts` | B1–B3, C1–C4, D1–D2 |
| P0 | `scenePresets.ts` | B4 |
| P0 | `designBackend.ts` | B3–B4, C1, C5 |
| P1 | `wireDesignToMock.ts` | C1 文案, C4, D3 |
| P1 | `types.ts` | D1–D2 |
| P1 | `contractService.ts` | A3 注释；必要时 join API 澄清 |
| P2 | `chainConfig.ts` / 币种展示 | D3 |
| P2 | `.env.example`、README | A1, F3 |
| 清理 | 审计 §9.1 / Counter 三件套 | F |

---

## 10. 提交顺序（执行时遵守）

1. `docs: add frontend-contract interface audit`（含本执行方案可选）
2. `fix: align local member and project state mapping`（B1–B3）
3. `fix: align join and exit flows with contract semantics`（C1–C2, C5）
4. `fix: validate deposits and rescue ticket totals`（B4 + 相关 UI）
5. `chore: remove obsolete design and Counter scaffolding`（F1–F2）
6. `docs: document mock and local Anvil workflows`（F3 + D3 文案若未进 fix）

状态映射（D1）若改动大，可并入 2 或单独：`fix: correct bounty and project status mapping`。

---

## 11. 明确延后（本轮不做）

| 项 | 原因 |
| --- | --- |
| 拆 `ChainContractService` / `MetadataService` / `DemoControlService` 三文件 | 注释分层足够；避免大重构拖慢联调 |
| 成果上 IPFS / content hash | 中期；本轮 localStorage + 稳定 key |
| 事件重建全量列表 API | 中期；先稳住 index + 容错读 |
| 5 人 Anvil 账户 | 先 3 人闭环 |
| 删除 `pages/**` 旧 React | 风险高；E 通过后再决策 |
| Monad / MetaMask | 验收清单全绿之后 |

---

## 12. 执行检查表（负责人勾选）

### 阶段 A

- [x] `.env.example` 完整
- [x] `ContractService` 方法已标注链上/链下/Demo
- [x] 范围共识：local 2～3 人闭环

### 阶段 B

- [x] 未 join `getMember` 不拖垮 hydrate
- [x] quit 映射正确
- [x] local ≤3 人
- [x] deposit>0；票总额≤救场池

### 阶段 C

- [x] local 一笔 `joinProject`
- [x] 姓名=测试账户映射
- [x] meta key 含 chainId+合约+id；刷新可恢复提交说明
- [x] reset 分模式文案正确
- [x] 多笔出票失败可定位

### 阶段 D

- [x] Rejected/Cancelled 映射正确
- [x] 项目 UI 态与链上态分离
- [x] 币种/场景/无「假后端」文案

### 阶段 E

- [ ] 审计 §8 全部勾选通过（需人工启动 Anvil 验收）

### 阶段 F

- [x] 安全删除清单已清理
- [x] Counter 脚手架已删
- [x] README + `.gitignore` 更新

---

## 13. 开始执行的建议入口

**代码改动已落地（A–D、F）。** 下一步：按阶段 E 启动 Anvil，跑通验收清单。
