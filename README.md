# 不要鸽我 · Don't Ghost Me

> 让成员退出后的违约保证金，变成奖励救场者的悬赏池。

[![CI](https://github.com/Gos0lis/dont-ghost-me/actions/workflows/test.yml/badge.svg)](https://github.com/Gos0lis/dont-ghost-me/actions/workflows/test.yml)
[![Solidity](https://img.shields.io/badge/Solidity-%5E0.8.20-363636?logo=solidity)](./src/DontGhostMe.sol)
[![Foundry](https://img.shields.io/badge/Built%20with-Foundry-FFB000)](https://book.getfoundry.sh/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](#license)

**在线 Demo**：<https://dont-ghost-me.vercel.app>

> [!IMPORTANT]
> 当前产品展示默认使用 **mock**（`localStorage` 模拟后端）。本地 Anvil 联调使用 `VITE_CHAIN_MODE=local`。尚未连接真实公链 / Monad，请勿向 Demo 发送真实资产。

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

## 当前进度

### 已完成

- [x] 项目创建、成员加入、保证金锁定与退出机制
- [x] 救场悬赏的发布、领取、提交、打回、拒绝、验收与支付
- [x] 成员驱逐提案、保证金、投票、执行和退款机制
- [x] 项目完成/取消后的成员保证金与救场池结算
- [x] Solidity 接口、核心事件、错误定义及安全防护
- [x] Foundry 功能与安全测试
- [x] V11 设计工作台 + mock 演示闭环
- [x] `viemContractService` 本地 Anvil 接入（2～3 人最小闭环）
- [x] `script/DontGhostMe.s.sol` 本地部署脚本
- [x] GitHub Actions 合约格式、构建与测试工作流

### 待完成

- [ ] 完成 local Anvil 端到端验收清单（见 `PRODUCT_INTERFACE_EXECUTION_PLAN.md` 阶段 E）
- [ ] 配置 Monad RPC、Chain ID 与真实钱包连接
- [ ] 增加链上事件索引，支持完整列表查询
- [ ] 为成果提交增加 URL、IPFS CID 或内容哈希存证
- [ ] 补充部署地址、广播记录、安全分析和上线运维文档

### 当前已知限制

- 默认 `VITE_CHAIN_MODE=mock`：金额与流程可演示，但不是链上真相。
- `local` 模式最多 3 名成员（Anvil 演示账户：Caro / Yunn / Builder 07）。
- local 重置只清浏览器索引，**不能**清链；需重启 Anvil 并重新部署。
- 成果链接仍存浏览器元数据；换浏览器会丢失。
- 合约按 ID 查询；列表依赖事件扫描 + 本地 index。
- 公链 / MetaMask / Monad 暂未启用。

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
├── .github/workflows/
│   └── test.yml              # Foundry CI
├── src/
│   ├── DontGhostMe.sol       # 主合约：保证金、悬赏、驱逐、结算逻辑
│   └── IDontGhostMe.sol      # ABI 接口
├── test/
│   ├── DontGhostMe.t.sol            # 功能测试
│   └── DontGhostMeSecurity.t.sol    # 安全测试（重入等）
├── script/
│   └── DontGhostMe.s.sol     # 本地 / Anvil 部署脚本
├── frontend/                 # React + Vite + TypeScript（V11 设计入口）
│   ├── .env.example
│   └── src/services/
│       ├── contractService.ts        # mock / local 切换
│       ├── mockContractService.ts    # 产品演示
│       ├── viemContractService.ts    # Anvil 联调
│       └── designBackend.ts          # 设计层编排
├── lib/forge-std/            # Foundry 标准库
└── foundry.toml              # Foundry 配置
```

---

## 智能合约

合约使用 Foundry 工具链开发，保证金与悬赏奖励以原生代币结算（在 Monad 上为 MON；本地 Anvil 为 ETH）。

### 核心机制

- **项目（Project）**：发起人创建项目并设定保证金金额，成员加入时缴纳保证金。
- **救场悬赏（Bounty）**：项目发起人可发布悬赏，描述任务并设定奖励；救场者领取、提交成果，经发起人验收后获得奖励。
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
cancelClaim(uint256 bountyId)
cancelSubmittedBounty(uint256 bountyId, string reason)
cancelStaleBounty(uint256 bountyId)

proposeExpulsion(uint256 projectId, address target) payable
voteExpulsion(uint256 proposalId, bool support)
executeExpulsion(uint256 proposalId)
withdrawExpulsionBondRefund()

finishProject(uint256 projectId) / cancelProject(uint256 projectId)
withdrawRemainingRescuePool(uint256 projectId)
sweepUnclaimedRescuePool(uint256 projectId)
```

完整接口见 [`src/IDontGhostMe.sol`](./src/IDontGhostMe.sol)。

### 构建 / 测试

```shell
# 克隆仓库（包含 forge-std 子模块）
git clone --recurse-submodules https://github.com/Gos0lis/dont-ghost-me.git
cd dont-ghost-me

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
```

> Foundry 文档：<https://book.getfoundry.sh/>

### 本地部署 DontGhostMe

```shell
# 终端 1
anvil

# 终端 2
forge script script/DontGhostMe.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

将部署地址写入 `frontend/.env.local` 的 `VITE_CONTRACT_ADDRESS`。

---

## 前端 Demo

前端入口为 V11 设计页（`DesignApp` → `wireDesignToMock` → `designBackend` → `contractService`）。

通过 `VITE_CHAIN_MODE` 切换后端：

| 模式 | 用途 | 数据 |
| --- | --- | --- |
| `mock`（默认） | 产品展示 / UI 调试 | localStorage |
| `local` | Anvil 合约联调 | 链上 + 浏览器元数据 |
| `chain` | 未来公链 | 暂勿启用 |

环境变量模板见 [`frontend/.env.example`](./frontend/.env.example)。

### 启动（mock 产品演示）

```bash
cd frontend
cp .env.example .env.local   # 保持 VITE_CHAIN_MODE=mock
npm install
npm run dev
```

双击品牌可重置演示数据。

### 启动（local Anvil 联调）

1. 启动 Anvil（`8545`）。
2. 部署合约并写入 `frontend/.env.local`：
   - `VITE_CHAIN_MODE=local`
   - `VITE_CONTRACT_ADDRESS=0x...`
   - `VITE_NATIVE_SYMBOL=ETH`
3. `cd frontend && npm run dev`
4. 仅支持 **2～3 人** 新建项目闭环：创建 → 分别 join → 退出出票 → 救场。
5. 双击品牌重置：只清浏览器索引；需重启 Anvil 并重新部署才能清链。

接口对齐说明见 [`PRODUCT_INTERFACE_AUDIT.md`](./PRODUCT_INTERFACE_AUDIT.md) 与 [`PRODUCT_INTERFACE_EXECUTION_PLAN.md`](./PRODUCT_INTERFACE_EXECUTION_PLAN.md)。

生产构建：

```bash
cd frontend
npm run build
```

### 推荐演示顺序（mock）

1. 打开首页，连接测试钱包 Caro。
2. 创建一份承诺（或切换黑客松 / 旅行场景）。
3. 进入成员确认，逐人「确认并签署」。
4. 模拟一名成员退出，生成救场票。
5. 切换到 Builder 07，领取 → 提交 → 切回 Caro 验收付款。

### 主要路由（旧 React 业务页，当前未挂载）

生产入口仅挂载 V11 设计页。下列路由代码仍保留在仓库中，供后续决策复用或删除：

- `/` 首页
- `/create` 创建共同承诺
- `/travel` 朋友旅行完整演示
- `/game-case` 游戏战队已完成案例回放
- `/projects` 我的项目
- `/project/:projectId` 项目详情
- `/bounties` 救场悬赏大厅
- `/my-tasks` 我的救场任务

---

## 技术栈

- **智能合约**：Solidity ^0.8.20 / Foundry（Forge、Cast、Anvil）
- **前端**：React / TypeScript / Vite
- **Web3 客户端**：viem（local）；wagmi 预留
- **目标链**：本地 Anvil 联调；Monad（MON）待启用
- **持续集成**：GitHub Actions

---

## License

项目主合约使用 [MIT License](https://spdx.org/licenses/MIT.html)，SPDX 标识为 `MIT`。仓库根目录 `LICENSE` 文件待补充。
