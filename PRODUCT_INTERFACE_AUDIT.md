# 不要鸽我：前端展示、数据服务与本地测试链接口审计

> 审计日期：2026-08-06  
> 审计范围：V11 前端展示、设计适配层、mock 后端、viem 本地链服务、Solidity 合约接口、仓库文件清理  
> 当前结论：mock 演示链路基本完整；local（Anvil）链路尚未达到稳定联调标准。  
> 运行约束：本次只做静态审计，没有启动 Vite、Anvil 或真实公链。5173、5174、8545 均已关闭。

---

## 1. 执行摘要

当前项目的数据链路为：

```text
V11 静态页面
  → wireDesignToMock.ts（DOM 事件和页面渲染）
  → designBackend.ts（产品流程编排）
  → contractService.ts（统一后端接口）
      → mockContractService.ts（localStorage 假后端）
      → viemContractService.ts（Anvil / 未来 Monad）
  → DontGhostMe.sol
```

架构方向是正确的：前端不应该直接调用 Solidity 合约，而应通过统一的
`ContractService` 接口切换 mock、本地测试链和未来真实链。

但是，目前“方法名称能够对应”不等于“业务含义已经对应”。主要问题是：

1. 创建项目后，未加入成员的 `getMember` 读取可能回滚，导致页面 hydrate 失败。
2. 本地链只配置了 3 个 Anvil 演示账户，超过 3 名成员无法正确逐人签署。
3. 合约只有 `joinProject`，前端却拆成“确认 + 锁定”两步。
4. 成员退出后的链上状态不能被当前前端准确映射成 `quit`。
5. 自定义场景默认保证金为 0，但合约禁止 0 保证金。
6. 成果链接和交付说明没有上链，只保存在浏览器本地。
7. local 模式下的“重置 Demo”不能清除链上状态。
8. 前端 7 类项目状态与合约 3 类项目状态没有完整转换规则。

因此，当前应继续保留 mock 作为产品展示环境；local 模式只作为下一阶段的测试环境，
完成本报告中的 P0、P1 修复后，再进行 Anvil 端到端联调。暂时不接真实公链。

---

## 2. 当前模式和配置

### 2.1 后端选择

`frontend/src/services/contractService.ts` 根据 `VITE_CHAIN_MODE` 选择实现：

```text
mock          → mockContractService
local / chain → viemContractService
```

当前 `frontend/.env.local` 配置为 `local`，但所有服务已经关闭。

### 2.2 环境职责

| 环境 | 用途 | 数据来源 | 是否建议当前使用 |
| --- | --- | --- | --- |
| mock | 产品展示、UI 调试 | localStorage | 是 |
| local | Anvil 合约联调 | 本地链 + localStorage 元数据 | 修复 P0/P1 后使用 |
| chain | 未来 Monad | 公链 + 链下元数据 | 暂不使用 |

### 2.3 重要原则

- 金额、成员加入、退出、悬赏状态和付款结果以链上数据为准。
- 昵称、任务、场景、交付清单、成果链接和时间线属于链下展示数据。
- 同一业务字段只能有一个权威来源，不能同时由 DOM、mock 和链上各自修改。
- local 和未来 Monad 应共用 `viemContractService`，只替换 RPC、Chain ID 和合约地址。

---

## 3. 产品操作与接口对应表

### 3.1 页面初始化与导航

| 前端操作 | 页面层 | 产品层 | 服务接口 | mock | local / 合约 |
| --- | --- | --- | --- | --- | --- |
| 初始化页面 | `wireDesignToMock` | `hydrate()` | `getWalletConnection/getProjects/getBounties` | 读取种子数据 | 扫事件后按 ID 读合约 |
| 切换黑客松/旅行 | `data-demo-scene` | `setScene()` | 无写操作 | 使用固定字符串 ID | 按名称/类别正则寻找链上项目 |
| 连接测试钱包 | `#walletButton` | `connectDemoWallet()` | `connectWallet()` | 模拟账户 | Anvil 固定账户 |
| 切换账户 | `#walletButton` | `switchAccount()` | `switchAccount()` | Caro/Yunn/Builder | Anvil 固定私钥账户 |
| 重置演示 | 双击品牌 | `resetDemo()` | `resetDemo()` | 重建 mock 状态 | 只能清浏览器，不能清链 |

问题：

- local 模式没有 mock 的预置黑客松/旅行项目。
- local 场景切换依赖名称正则，不是稳定的项目 ID 选择。
- local “重置”后，链上事件会重新把旧项目索引回来。

### 3.2 创建承诺

| 项目 | 前端字段 | `CreateProjectInput` | mock | local / 合约 |
| --- | --- | --- | --- | --- |
| 项目名称 | `projectName` | `name` | 保存 | `createProject(name, depositAmount)` |
| 场景 | scene option | `category` | 保存 | 链下元数据 |
| 项目说明 | 页面生成 | `description` | 保存 | 链下元数据 |
| 目标 | 成员任务拼接 | `goal` | 保存 | 链下元数据 |
| 截止时间 | `promiseDeadline` | `deadline` | 保存 | 链下元数据 |
| 成员 | member rows | `members[]` | 全部保存 | 名单链下，加入状态链上 |
| 保证金 | `promiseDeposit` | 每个 member.deposit | 数字单位 | `parseEther()` 后传合约 |

对应调用：

```text
#sendPromiseButton
  → designBackend.createPromise()
  → contractService.createProject()
  → mockContractService.createProject()
    或 viemContractService.createProject()
  → DontGhostMe.createProject(name, depositAmount)
```

主要缺口：

- 合约只存项目名称和统一保证金，不存成员名单、场景、任务和截止时间。
- 自定义场景默认保证金为 0，合约会回滚。
- local 服务按成员数组下标硬绑定 Anvil 账户，显示姓名和实际签名地址可能不一致。

### 3.3 成员确认与保证金

```text
#confirmCurrentMember
  → designBackend.signMember()
  → confirmParticipation()
  → lockDeposit()
```

| 层 | 当前行为 |
| --- | --- |
| UI | 将确认和保证金锁定描述为两个产品步骤 |
| mock | 先 `confirmed`，再 `active + depositLocked` |
| viem | `confirmParticipation` 只生成链下假回执；`lockDeposit` 调用 `joinProject` |
| 合约 | 只有 `joinProject(projectId)`，并通过 `msg.value` 一次完成加入和缴纳 |

建议：

- local 模式将“确认并签署”定义为一次 `joinProject` 交易。
- `confirmParticipation` 只保留给 mock，或在统一接口中明确为链下动作。
- 页面不要在 local 模式展示两笔链上交易。
- 成员加入状态只以 `getMember.active` 为权威数据。

### 3.4 退出和生成救场票

```text
#confirmExitTransfer
  → designBackend.quitAndSpawnTickets()
  → quitProject()
  → N × createBounty()
```

| 层 | 退出 | 出票 |
| --- | --- | --- |
| mock | `quitProject` 将保证金转救场池 | 循环创建 bounty |
| viem | `leaveProject` | 循环 `createBounty` |
| 合约 | `leaveProject(projectId)` | `createBounty(projectId, description, reward)` |

设计稿与合约通过产品编排层实现“退出后自动生成多张票”，这个方向正确。

仍需处理：

- 必须先完成 `joinProject` 才能退出。
- 当前链上读取把退出成员映射成 `invited`，应改为 `quit`。
- 黑客松票奖励合计 100，旅行票奖励合计 50；用户修改保证金后，可能出现票总额大于救场池。
- 出票应先校验 `sum(reward) <= availableRescuePool`。
- 多笔交易中途失败时，需要页面展示“已完成几笔、失败在哪一笔”，不能只显示整体失败。

### 3.5 救场流程

| UI 动作 | 产品层 | 服务接口 | 合约 |
| --- | --- | --- | --- |
| 领取 | `claimBounty()` | `claimBounty()` | `claimBounty()` |
| 提交 | `submitBounty()` | `submitWork()` | `submitWork(bountyId)` |
| 退回 | `requestRevision()` | `requestRevision()` | `requestRevision()` |
| 验收付款 | `approveAndPay()` | `approveAndPay()` | `approveWork()` |

状态映射：

```text
Open              → open
Claimed           → claimed
Submitted         → submitted
RevisionRequested → revision_required
Approved / Paid   → approved / paid
```

主要缺口：

- 合约的 `submitWork` 不接收成果 URL 或说明。
- 当前 URL、说明、测试记录只存 localStorage，换浏览器后会丢失。
- 合约有 `Rejected` 和 `Cancelled`，前端领域类型没有对应状态。
- 当前 viem 映射把 `Rejected` 当成 `approved`，把 `Cancelled` 当成 `open`，属于错误状态展示。

---

## 4. 数据字段的权威来源

### 4.1 Project

| 字段 | mock 来源 | local 来源 | 建议权威来源 |
| --- | --- | --- | --- |
| id | 字符串种子/时间戳 | 链上 uint 转字符串 | 链上 |
| name | mock | `getProject.name` | 链上 |
| creatorAddress | 当前账户 | `getProject.owner` | 链上 |
| depositAmount | mock member | `getProject.depositAmount` | 链上 |
| rescuePool | mock | `getProject.rescuePool` | 链上 |
| reservedBounty | mock | `getProject.reservedBounty` | 链上 |
| status | mock 7 态 | 合约 3 态转换 | 链上 + 前端派生 |
| category/goal/deadline | mock | localStorage meta | 链下元数据 |
| progress | mock 计算 | 当前硬编码 | 前端派生，不应伪装成链上 |
| timeline | mock 写入 | localStorage meta | 链上事件 + 链下文案 |

### 4.2 Member

| 字段 | 建议来源 |
| --- | --- |
| address、deposit、active、withdrawn | 链上 `getMember` / 事件 |
| name、role、task、taskDeadline | 链下元数据 |
| id | 统一使用 address，或明确的链下 memberId |
| status | 由 `active/withdrawn` 派生，不重复存储 |

### 4.3 Bounty

| 字段 | 建议来源 |
| --- | --- |
| id/projectId/reward/creator/hunter/status/reviewReason | 链上 |
| title/category/skills/deliverables/acceptanceCriteria | 链下元数据 |
| submission URL/summary/test notes | 当前链下；后续改 IPFS/CID 或 content hash |

### 4.4 Wallet 与交易回执

| 环境 | 钱包 | 回执 |
| --- | --- | --- |
| mock | localStorage 账户 | 随机模拟 hash |
| local | Anvil 测试私钥 | 真正本地链交易 |
| future chain | MetaMask/钱包连接器 | 真实链交易 |

Anvil 默认私钥只能存在本地开发实现中，不能进入未来公链生产包。

---

## 5. 问题分级

### P0：阻断本地链主流程

1. **未加入成员读取 `getMember` 可能回滚**
   - 位置：`frontend/src/services/viemContractService.ts` 的 `readChainProject`
   - 结果：创建项目后 hydrate 失败，页面没有有效 snapshot。
   - 修改：对未加入成员做容错，或通过事件/元数据先显示 `invited`。

2. **本地链最多只能稳定映射 3 个成员**
   - 位置：`LOCAL_DEMO_ACCOUNTS` 和创建项目时的 index 映射。
   - 结果：第 4 人及以后可能复用当前账户，导致 `Already joined`。
   - 修改：本地测试模式限制成员数，或完整配置足够的 Anvil 账户。

3. **退出成员状态映射错误**
   - 位置：`readChainProject` 中 Member → ProjectMember 转换。
   - 结果：退出后显示为 `invited` 而不是 `quit`。
   - 修改：结合 `active/withdrawn` 和成员事件准确派生。

4. **自定义场景保证金为 0**
   - 位置：`frontend/src/data/scenePresets.ts`。
   - 结果：链上 `createProject` 回滚。
   - 修改：前端校验 `deposit > 0`，自定义默认值改成正数。

### P1：业务语义不一致

1. local 的 `confirmParticipation` 是假交易。
2. 成员姓名与实际签名地址可能不一致。
3. 成果链接仅存在浏览器本地。
4. 出票总额未与救场池余额做前置校验。
5. `resetDemo` 无法重置 Anvil 合约状态。
6. 项目和悬赏列表依赖 localStorage index，链上无列表 API。

### P2：状态和展示不一致

1. 前端 7 个项目状态与合约 3 个状态没有正式转换表。
2. Rejected/Cancelled 映射错误。
3. 页面固定显示 MON，本地链配置显示 ETH。
4. 场景切换通过项目名称正则匹配，稳定性不足。
5. local 模式仍出现“假后端已重置”等误导文案。

### P3：功能缺口

- V11 未接项目完成、取消、放弃悬赏、驱逐投票和救场池最终结算。
- `advanceProject`、`batchResolveBounties` 是 mock 特有流程，合约没有对应函数。
- 草稿按钮未持久化。

---

## 6. 修改建议

### 6.1 接口层

建议把统一接口拆成三类：

```text
ChainContractService
  - createProject / joinProject / leaveProject
  - createBounty / claimBounty / submitWork
  - requestRevision / approveWork / read methods

MetadataService
  - project profile / member display data
  - bounty title and deliverables
  - work submission URL/CID

DemoControlService
  - mock reset / Anvil reset instructions / seed
```

如果暂不拆文件，也应在 `ContractService` 注释中明确哪些方法是链上动作、哪些是链下动作。

### 6.2 类型层

- 项目和悬赏 ID 对外统一为 string，但 local 服务入口必须校验为数字字符串。
- 补充 `cancelled`、`rejected` 状态，禁止错误复用 `open/approved`。
- 将链上状态与 UI 派生状态分开：

```text
chainStatus: Active | Finished | Cancelled
uiStatus: awaiting_confirmation | rescue_needed | rescue_in_progress | active_again
```

- 将 `Member.status` 改为从 `active/withdrawn/joined` 派生。

### 6.3 本地测试账户

- local 模式明确限制最多 3 人，作为第一阶段最小闭环。
- 创建表单根据 local 模式隐藏“添加第 4 人”或给出提示。
- 页面显示名必须和测试账户地址映射表一致。
- 后续需要 5 人演示时，再增加 Anvil 账户映射，不要静默复用 Caro。

### 6.4 元数据

短期：

- 继续使用 localStorage，但使用合约地址 + chainId + projectId 作为 key。
- 不要清 index 时同时清掉无法从链恢复的 member/submission 元数据。

中期：

- 成果提交改成 IPFS CID 或内容哈希。
- 使用合约事件重建项目和悬赏列表。

### 6.5 reset

| 模式 | 正确行为 |
| --- | --- |
| mock | 重建初始 localStorage 状态 |
| local | 明确提示“需要重启 Anvil 并重新部署”，不伪装清链成功 |
| chain | 禁止 reset |

---

## 7. 推荐修改流程

### 阶段 A：收敛范围

1. 保留 mock 为默认产品展示。
2. local 仅支持“新建 2～3 人项目并完成闭环”。
3. 暂不实现驱逐、项目结算和公链钱包。

### 阶段 B：修复 P0

1. 修复未加入成员读取。
2. 修复退出状态映射。
3. 限制 local 成员数或补全账户。
4. 增加保证金和票总额校验。

### 阶段 C：统一语义

1. local 的“确认并签署”只执行一笔 `joinProject`。
2. mock 仍可内部模拟确认状态，但 UI 文案与 local 保持一致。
3. 补齐项目和悬赏状态转换。
4. 修正 local/reset/币种文案。

### 阶段 D：本地链验收

只运行 Anvil，不接任何真实公链：

1. 启动 Anvil。
2. 部署 `DontGhostMe`。
3. 更新 `.env.local` 合约地址。
4. 启动 Vite。
5. 创建 2 人项目，保证金 100。
6. 两名成员分别加入并缴纳保证金。
7. 一名成员退出，救场池变为 100。
8. 创建合计不超过 100 的救场票。
9. Builder 领取、提交，Caro 返修或验收。
10. 刷新页面，链上状态和链下元数据仍能恢复。

### 阶段 E：清理与文档

1. 删除确认无引用的旧文件。
2. 更新 README 的运行方式和模式说明。
3. 提交 `.env.example`，不提交 `.env.local`。
4. mock 与 local 分别建立测试清单。

---

## 8. 本地链验收标准

完成以下条件后，才能称为“前端已稳定接入本地测试链”：

- [ ] Anvil 未启动时页面明确报错，不出现无响应按钮。
- [ ] 创建项目后刷新不会 hydrate 失败。
- [ ] 2～3 名成员可分别 join，地址与姓名一致。
- [ ] 未 join 成员显示 invited，已 join 成员显示 active。
- [ ] 退出成员显示 quit，保证金进入 rescuePool。
- [ ] 票奖励总额不能超过可用救场池。
- [ ] 悬赏状态 Open → Claimed → Submitted → Revision/Paid 正确显示。
- [ ] Rejected 和 Cancelled 不会显示成 Approved/Open。
- [ ] 刷新后项目、成员、票和成果元数据可以恢复。
- [ ] mock reset、local reset、chain 禁止 reset 的行为各自正确。
- [ ] local 模式不再出现“假后端”误导文案。

---

## 9. 无用、重复和暂留文件

本节只列清单，本次不执行删除。

### 9.1 可安全删除

| 路径 | 原因 | 风险 |
| --- | --- | --- |
| `frontend/src/design/initDesignDemo.js` | 无 import，已被 `wireDesignToMock.ts` 替代 | 低 |
| `frontend/src/design/initDesignDemo.d.ts` | 只服务于上述无引用 JS | 低 |
| `frontend/src/contracts/mockAbi.ts` | 无引用，已由真实 ABI 替代 | 低 |
| `frontend/design-reference/v11/dont-ghost-me-codepen-v11.txt` | 与 `.html` 为重复单文件版本 | 低 |
| `frontend/design-reference/v11/style.css` | 生产版本为 `src/styles/design-v11.css` | 低 |
| `frontend/design-reference/v11/script.js` | 旧 DOM 交互，已迁移 | 低 |

### 9.2 建议成套删除的 Foundry 脚手架

以下三个必须一起处理，并先确认新部署脚本已提交：

```text
src/Counter.sol
test/Counter.t.sol
script/Counter.s.sol
```

保留：

```text
script/DontGhostMe.s.sol
```

### 9.3 生成物和本地配置：不应提交

| 路径 | 处理 |
| --- | --- |
| `out/**` | 忽略，可重新 build |
| `cache/**` | 忽略，可删除 |
| `broadcast/**/31337/**` | 本地部署记录，忽略 |
| `frontend/dist/**` | 构建输出，忽略 |
| `frontend/node_modules/**` | 依赖目录，忽略 |
| `frontend/node_modules/.vite/**` | Vite 缓存，忽略 |
| `frontend/.env.local` | 本机配置，不提交 |

应该提交：

```text
frontend/.env.example
```

### 9.4 当前未挂载，但暂不建议删除

当前生产入口只有：

```text
main.tsx → App.tsx → DesignApp.tsx
```

因此以下旧 React 模块没有挂载：

```text
frontend/src/pages/**
frontend/src/components/**
frontend/src/layouts/**
frontend/src/store/useAppStore.ts
```

这些文件包含旧版完整业务页面和 store。建议在完成本地链接口对齐后再决定：

- 恢复路由并复用；
- 或确认 V11 DOM 方案长期保留后删除。

目前直接删除风险较高。

### 9.5 当前生产入口：禁止删除

```text
frontend/index.html
frontend/src/main.tsx
frontend/src/App.tsx
frontend/src/design/DesignApp.tsx
frontend/src/design/designBody.html
frontend/src/design/wireDesignToMock.ts
frontend/src/styles/design-v11.css
frontend/src/services/designBackend.ts
frontend/src/services/contractService.ts
frontend/src/services/mockContractService.ts
frontend/src/contracts/types.ts
frontend/src/data/scenePresets.ts
frontend/vite.config.ts
src/DontGhostMe.sol
src/IDontGhostMe.sol
```

local 模式还依赖：

```text
frontend/src/services/viemContractService.ts
frontend/src/contracts/chainConfig.ts
frontend/src/contracts/dontGhostMeAbi.ts
script/DontGhostMe.s.sol
```

### 9.6 重复来源的唯一保留建议

| 内容 | 建议保留 |
| --- | --- |
| V11 生产样式 | `frontend/src/styles/design-v11.css` |
| V11 生产 HTML | `frontend/src/design/designBody.html` |
| V11 生产交互 | `frontend/src/design/wireDesignToMock.ts` |
| 合约 ABI | `frontend/src/contracts/dontGhostMeAbi.ts` |
| 业务部署脚本 | `script/DontGhostMe.s.sol` |
| CodePen 归档 | 只保留 `.html`，删除同内容 `.txt` |

---

## 10. 建议提交顺序

不要把当前所有改动一次性混在一个提交里。建议：

1. `docs: add frontend-contract interface audit`
2. `fix: align local member and project state mapping`
3. `fix: align join and exit flows with contract semantics`
4. `fix: validate deposits and rescue ticket totals`
5. `chore: remove obsolete design and Counter scaffolding`
6. `docs: document mock and local Anvil workflows`

---

## 11. 最终判定

### 已经对齐

- UI → `designBackend` 的主流程调用。
- `designBackend` → `ContractService` 的统一入口。
- viem 与 Solidity 的主要写方法名称：
  `createProject/joinProject/leaveProject/createBounty/claimBounty/submitWork/requestRevision/approveWork`。
- mock 模式的产品演示闭环。

### 尚未对齐

- local 模式的成员读取、成员账户数量和退出状态。
- confirm + lock 与单一 `joinProject` 的语义。
- 前端状态枚举与 Solidity 状态枚举。
- 链下成果与链上提交状态的恢复。
- local reset 与链上不可重置事实。
- 演示场景 ID、项目索引和币种文案。

### 产品建议

当前应继续：

```text
mock = 默认展示环境
local Anvil = 修复后的合同联调环境
Monad = 暂不启用
```

完成 P0、P1 和本地链验收清单后，再考虑真实钱包和 Monad 部署。
