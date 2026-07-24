# 不要鸽我 · Don't Ghost Me

> 让成员退出后的违约保证金，变成奖励救场者的悬赏池。

**在线 Demo**：<https://dont-ghost-ie2tu7thg-clori001s-projects.vercel.app>

---

## 项目简介

“不要鸽我”是一个面向多人小团队的 Web3 协作承诺协议。参与者提前确认承诺并提交模拟保证金；当有人临时退出（“鸽”）时，其保证金不再退回，而是进入**救场悬赏池**，用于奖励那些帮助团队补齐遗留任务的人。

无论是黑客松队伍里临时跑路的开发，还是朋友出行中临时取消的旅伴，“不要鸽我”都让退出者承担责任，让真正花时间补位的人获得补偿。

### 核心问题

团队成员临时退出时，不仅会打乱原有计划，还会留下任务和费用缺口：

- **黑客松**：成员退出后，开发任务无人完成，整个项目卡壳。
- **朋友出行**：朋友临时取消旅行，产生门票转卖、酒店修改、寻找替补、行程调整等一系列麻烦。

当前大家通常通过微信群临时沟通，由其他成员无偿承担遗留工作，或直接平摊损失。退出者的责任不明确，真正解决问题的人也得不到补偿。

### 我们的方案

“不要鸽我”让参与者提前确认承诺并提交模拟保证金：

1. 成员加入项目时，按规则缴纳保证金。
2. 成员主动退出或被驱逐后，其保证金进入救场悬赏池。
3. 团队发布救场悬赏，描述需要补位的任务与奖励金额。
4. 救场者（hunter）领取悬赏、提交成果，团队验收通过后获得奖励。
5. 项目完成后，剩余保证金与救场池余额按规则结算退还。

该机制既可用于黑客松任务补位，也可用于旅行中的找替补、转卖门票和修改行程。

---

## 团队

**团队名称**：不要鸽我

| 成员 | 角色 | 职责 |
| --- | --- | --- |
| Yoyo | 设计 UI 原型稿 | 设计绘制 UI 原型稿，运营宣传 |
| Jimmy | 记录与运营 | 会议记录、用户调研、资料整理、整体推进 |
| Yunn | 智能合约开发 | 保证金、违约判定、救场悬赏、结算机制 |
| Caro | 前端开发 | 网页功能、钱包交互、产品 Demo |
| 北海 | UI/UX 与测试 | 界面设计、用户体验、功能测试 |

### 目标用户

需要共同完成一项计划的多人小团队，例如：

- 参加黑客松的学生团队
- 相约出行的朋友群体

---

## 仓库结构

```
dont-ghost-me/
├── src/
│   ├── DontGhostMe.sol       # 主合约：保证金、悬赏、驱逐、结算逻辑
│   └── IDontGhostMe.sol      # ABI 接口
├── test/
│   ├── DontGhostMe.t.sol            # 功能测试
│   └── DontGhostMeSecurity.t.sol    # 安全测试（重入等）
├── frontend/                # React + Vite + TypeScript 前端 Demo
├── lib/forge-std/            # Foundry 标准库
└── foundry.toml              # Foundry 配置
```

---

## 智能合约

合约使用 Foundry 工具链开发，保证金与悬赏奖励以原生代币结算（在 Monad 上为 MON）。

### 核心机制

- **项目（Project）**：发起人创建项目并设定保证金金额，成员加入时缴纳保证金。
- **救场悬赏（Bounty）**：项目成员可发布悬赏，描述任务并设定奖励；救场者领取、提交成果，经成员验收后获得奖励。
- **驱逐提案（ExpulsionProposal）**：成员可发起驱逐提案，需缴纳提案保证金（bond），投票通过后目标成员被驱逐，其保证金进入救场池；提案失败则部分保证金被罚没。
- **救场池结算（RescuePoolSettlement）**：项目完成或取消后，剩余保证金与救场池余额按规则分配给合格成员，未领取部分由发起人回收。

### 关键状态

- `ProjectStatus`：`Active` / `Finished` / `Cancelled`
- `BountyStatus`：`Open` → `Claimed` → `Submitted` → (`RevisionRequested` / `Rejected` / `Approved`) → `Paid` / `Cancelled`

### 主要接口

```solidity
createProject(string name, uint256 depositAmount)
joinProject(uint256 projectId) payable
leaveProject(uint256 projectId)
withdrawDeposit(uint256 projectId)

createBounty(uint256 projectId, string description, uint256 reward)
claimBounty(uint256 bountyId)
submitWork(uint256 bountyId)
requestRevision(uint256 bountyId, string reason)
approveWork(uint256 bountyId) / rejectWork(uint256 bountyId, string reason)
cancelBounty(uint256 bountyId)

proposeExpulsion(uint256 projectId, address target) payable
voteExpulsion(uint256 proposalId, bool support)
executeExpulsion(uint256 proposalId)

finishProject(uint256 projectId) / cancelProject(uint256 projectId)
withdrawRemainingRescuePool(uint256 projectId)
sweepUnclaimedRescuePool(uint256 projectId)
```

完整接口见 [`src/IDontGhostMe.sol`](./src/IDontGhostMe.sol)。

### 构建 / 测试

```shell
# 构建
forge build

# 运行全部测试
forge test

# 格式化
forge fmt

# Gas 快照
forge snapshot

# 本地节点
anvil

# 部署
forge script script/Counter.s.sol:CounterScript \
  --rpc-url <your_rpc_url> --private-key <your_private_key>
```

> Foundry 文档：<https://book.getfoundry.sh/>

---

## 前端 Demo

前端基于 React + Vite + TypeScript。当前 Demo 不连接真实合约，所有关键业务操作通过统一的假合约服务执行，并使用 `localStorage` 模拟链上状态持久化。未来接入真实合约时，只需新增 `viemContractService.ts` 并替换服务绑定，页面路由与组件流程无需重新设计。

### 启动

```bash
cd frontend
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

### 推荐演示顺序

#### 场景一：黑客松救场

1. 首页连接模拟钱包，默认选择项目发起人 Caro。
2. 进入“我的项目”并打开“Monad 黑客松作品开发”。
3. 点击“模拟 Yunn 鸽掉”，确认交易。
4. 观察 Yunn 状态、保证金统计、救场池和时间线同步更新。
5. 点击“发布救场悬赏”，发布“紧急完成智能合约 MVP”。
6. 在右上角切换到 Builder 07，领取悬赏。
7. 进入“我的任务”，提交预填好的救场成果。
8. 切回 Caro，从项目或悬赏详情进入验收页面。
9. 勾选四项验收标准，点击“验收通过并支付奖励”。
10. 查看结算成功页：80 MON 到账、救场池剩余 20 MON、项目恢复进行。
11. 回到项目页，确认最终里程碑并点击“完成项目并结算”。
12. 项目进度更新为 100%，其余成员保证金解锁。

#### 场景二：朋友旅行

1. 首页“更多使用场景”进入“朋友旅行”完整 Demo。
2. 以 Caro 身份点击“模拟 Yoyo 临时退出”，确认退出交易。
3. 观察 100 MON 从旅行保证金转入补救悬赏池。
4. 点击“将 100 MON 拆成 3 个悬赏”，确认依次发布三笔交易。
5. 查看 40 MON 寻找替补、40 MON 转卖门票、20 MON 修改酒店与行程。
6. 可逐笔进入悬赏大厅操作，或使用“现场快速完成三项补救”。
7. 点击“完成旅行并结算”，查看项目完成和 400 MON 保证金解锁。

#### 场景三：游戏组队

1. 首页进入“游戏开黑”已完成案例。
2. 点击“回放完整救场过程”。
3. 观察创建承诺、成员退出、悬赏发布、替补领取、成果验收、奖励支付和最终结算八个链上节点。
4. 也可以点击任意进度节点，现场讲解对应的资金和项目状态。

页面顶部提供“重置 Demo”，可以随时恢复初始状态。

### 主要路由

- `/` 首页
- `/create` 创建共同承诺
- `/travel` 朋友旅行完整演示
- `/game-case` 游戏战队已完成案例回放
- `/projects` 我的项目
- `/project/:projectId` 项目详情
- `/project/:projectId/create-bounty` 发布救场悬赏
- `/bounties` 救场悬赏大厅
- `/bounty/:bountyId` 悬赏详情
- `/my-tasks` 我的救场任务
- `/bounty/:bountyId/submit` 提交成果
- `/project/:projectId/review/:bountyId` 验收成果
- `/settlement-success` 结算成功

---

## 技术栈

- **智能合约**：Solidity ^0.8.20 / Foundry（Forge、Cast、Anvil）
- **前端**：React + Vite + TypeScript
- **目标链**：Monad（原生代币 MON）

---

## License

SPDX-License-Identifier: MIT
