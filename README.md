# 不要鸽我 · Don't Ghost Me

> 让退出成本，成为救场预算。

「不要鸽我」是一个面向多人协作场景的 Web3 承诺协议：成员共同承诺并锁定保证金；有人中途退出时，保证金自动进入救场池，形成悬赏任务，奖励真正补位的人。

[![CI](https://github.com/Gos0lis/dont-ghost-me/actions/workflows/test.yml/badge.svg)](https://github.com/Gos0lis/dont-ghost-me/actions/workflows/test.yml)
[![Solidity](https://img.shields.io/badge/Solidity-%5E0.8.20-363636?logo=solidity)](./src/DontGhostMe.sol)
[![Foundry](https://img.shields.io/badge/Built%20with-Foundry-FFB000)](https://book.getfoundry.sh/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

## 项目背景

多人协作中，最难处理的往往不是任务本身，而是有人临时退出之后留下的工作、费用和交付责任。

黑客松队友可能突然离队，朋友出行可能临时取消，开源协作者可能留下未完成的 issue。剩余成员通常需要自行寻找补位者，但原有的口头承诺很难提供足够激励，也缺少一个所有参与者都愿意接受的中心化裁判。

「不要鸽我」把这个问题转化为一套可执行的协作规则：退出有成本，补位有奖励，最终结算由预先部署的智能合约执行。

## 目标用户

- 黑客松和短期项目小队
- 创业团队和临时协作小组
- 朋友出行、活动组织和多人预订群组
- 开源项目和社区任务协作者
- 任何需要多人共同履约的小型组织

## 核心机制

~~~text
创建承诺
    ↓
成员加入并锁定保证金
    ↓
正常完成：保证金退回
    或
成员退出：保证金进入救场池
    ↓
创建救场悬赏
    ↓
领取任务 → 提交成果 → 发起人验收
    ↓
救场者获得奖励，项目完成结算
~~~

## 核心功能

### 1. 创建共同承诺

发起人设置协作场景、成员席位、每人保证金和承诺期限，并邀请其他成员加入。

### 2. 钱包加入

每位成员通过自己的钱包确认并锁定保证金。成员身份、加入状态和保证金由合约记录。

### 3. 成员退出与救场池

如果成员中途退出，其保证金不会直接消失，而是进入当前承诺对应的救场池，为后续补位任务提供奖励。

### 4. 救场悬赏

发起人可以根据遗留工作创建悬赏任务。其他用户可以查看任务、领取任务、提交成果，并等待发起人验收。

### 5. 自动支付与结算

成果验收通过后，悬赏奖励按照合约规则支付给救场者。项目正常结束后，活跃成员的保证金自动退回。

### 6. 多种运行模式

前端统一支持 "mock"、"local" 和 "chain" 三种模式，方便评委快速体验 UI，也方便开发者进行本地联调和真实链上验证。

## 为什么需要 Web3

这个项目并不是把普通待办事项搬到区块链上。它真正需要解决的是多人之间的资金、规则和利益冲突：

- 参与者不一定信任同一个中心化平台
- 保证金和悬赏需要由代码托管和流转
- 成员退出、任务领取、成果提交和支付需要按照预先约定的规则执行
- 每个参与者都需要能够核验状态和资金去向

智能合约把承诺、保证金、救场任务和结算连接成一条可追踪的协作闭环。项目创建者负责确认成果，但资金流转和状态变化由合约执行，减少了口头承诺和人工对账带来的不确定性。

## Monad 的具体使用方式

项目的链上版本部署在 Monad Testnet，使用 Chain ID "10143" 和原生代币 "MON"。

前端通过 viem 连接 Monad Testnet，链上模式下可以使用 MetaMask 或 Rabby 完成以下操作：

- 创建项目并锁定保证金
- 加入项目并确认成员身份
- 退出项目并将保证金转入救场池
- 创建、领取和提交救场任务
- 验收成果并向救场者支付悬赏
- 完成项目并退回剩余保证金

线上 Demo 默认面向产品体验和链上演示。没有测试网 MON 时，可以先使用 "mock" 模式体验主要页面和流程；进行真实交易时，请切换到 Monad Testnet，并使用测试网水龙头获取 MON。

## 合约接口

主要项目流程：

~~~text
createProject → joinProject → leaveProject → finishProject
~~~

主要救场流程：

~~~text
createBounty → claimBounty → submitWork → approveWork
~~~

当前合约还包含项目取消、成员驱逐和相关 bond 处理逻辑，完整接口见 [src/IDontGhostMe.sol](./src/IDontGhostMe.sol)。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 智能合约 | Solidity ^0.8.20 |
| 合约工具 | Foundry、Forge、Cast、Anvil |
| 前端 | React、TypeScript、Vite |
| 链交互 | viem |
| 目标链 | Monad Testnet |
| 测试 | Foundry Test |
| 持续集成 | GitHub Actions |

## 仓库结构

~~~text
dont-ghost-me/
├── src/
│   ├── DontGhostMe.sol          # 主合约：项目、成员、救场与结算
│   └── IDontGhostMe.sol         # 合约接口
├── test/                        # Foundry 功能与安全测试
├── script/
│   └── DontGhostMe.s.sol        # 本地部署脚本
├── frontend/                    # React Demo
│   ├── scripts/deploy-monad.mjs # Monad Testnet 部署脚本
│   └── src/
│       ├── design/              # 页面与交互设计
│       ├── services/            # mock / local / chain 服务层
│       └── contracts/           # ABI、类型和链配置
├── foundry.toml
├── foundry.lock
└── README.md
~~~

前端主要路由：

| 路由 | 页面 |
| --- | --- |
| "/" | 首页与项目介绍 |
| "/promises" | 我的承诺 |
| "/rescue" | 救场大厅 |
| "/pigeon" | 我的信鸽 |

## 在线 Demo 使用说明

### 快速体验

1. 打开 [线上 Demo](https://dont-ghost-me.vercel.app/)。
2. 先浏览首页、我的承诺和救场大厅，了解产品结构。
3. 需要真实链上交互时，点击连接钱包。
4. 在钱包中切换到 Monad Testnet，Chain ID 为 "10143"。
5. 使用测试网 MON 完成创建、加入或救场操作。

### 推荐演示路径

#### 路径 A：正常完成

~~~text
创建承诺 → 其他成员加入 → 所有人完成承诺 → owner 结算 → 保证金退回
~~~

#### 路径 B：有人退出并触发救场

~~~text
创建承诺 → 成员加入 → 成员退出 → 生成救场池
→ 创建悬赏 → 救场者领取 → 提交成果 → owner 验收支付
~~~

线上 Demo 不要求固定演示账号。"chain" 模式需要钱包和测试网 MON；没有测试币时，可以使用本地 "mock" 模式完成产品流程演示。

## 本地开发

### 环境要求

- Node.js 18 或更高版本
- npm
- Foundry
- MetaMask 或 Rabby（仅真实链上模式需要）

### 1. 克隆仓库

~~~bash
git clone --recurse-submodules https://github.com/Gos0lis/dont-ghost-me.git
cd dont-ghost-me
~~~

### 2. 构建和测试合约

~~~bash
forge build
forge test
forge fmt
~~~

### 3. 使用 Mock 模式运行前端

~~~bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
~~~

打开 <http://localhost:5173/>。在 ".env.local" 中确认：

~~~dotenv
VITE_CHAIN_MODE=mock
~~~

Mock 模式使用浏览器本地存储，不需要钱包和测试网资产，适合快速体验产品流程。

### 4. 使用 Monad Testnet

在仓库根目录准备本地 ".env.monad"，其中包含部署账户私钥。私钥只允许保存在本地，不要提交到 GitHub。

~~~bash
forge build
node frontend/scripts/deploy-monad.mjs
~~~

部署脚本会生成或更新前端链上配置。然后启动前端：

~~~bash
cd frontend
npm install
npm run dev
~~~

连接 MetaMask 或 Rabby，切换到 Monad Testnet 后即可进行真实链上交互。

测试网水龙头：<https://faucet.monad.xyz>

### 5. 使用本地 Anvil

终端一：

~~~bash
anvil
~~~

终端二：

~~~bash
forge script script/DontGhostMe.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast
~~~

在 "frontend/.env.local" 中配置本地合约地址：

~~~dotenv
VITE_CHAIN_MODE=local
VITE_CONTRACT_ADDRESS=0x...
VITE_RPC_URL=/anvil
VITE_NATIVE_SYMBOL=ETH
~~~

Anvil 重启后需要重新部署合约。清除浏览器缓存只能重置前端本地数据，无法清除链上的项目状态。

### 6. 生产构建

~~~bash
cd frontend
npm run build
~~~

Vercel 构建默认读取 [frontend/.env.production](./frontend/.env.production)。如果重新部署合约，请同步更新合约地址、网络配置和线上环境变量。

## 当前完成度

- 已完成共同承诺创建和成员加入流程。
- 已完成保证金锁定、成员退出和救场池机制。
- 已完成救场任务创建、领取、提交和验收支付流程。
- 已完成 Monad Testnet 合约部署。
- 已完成线上 Demo、Foundry 测试和 GitHub Actions。
- 已完成产品演示 PPT 与 3 分钟以内的项目演示视频。

## Known Issues 与边界

- "chain" 模式需要 MetaMask 或 Rabby，并且需要 Monad Testnet 测试币。
- 链上交易的等待时间取决于钱包确认和测试网状态。
- 当前版本的最终成果验收仍由项目创建者完成。
- 当前版本主要用于黑客松 Demo，尚未进行生产环境安全审计。
- 任务成果目前主要通过前端流程提交，后续将补充去中心化存证。
- 请勿向 Demo 或测试网账户发送主网资产。

## 下一步计划

1. 使用 IPFS 或其他去中心化存储保存任务成果和验收证据。
2. 引入多签或社区仲裁机制，降低单一 owner 的裁量风险。
3. 支持创业分工、赛事执行和开源任务等更多协作场景。
4. 增加邀请链接、通知、任务提醒和历史贡献记录。
5. 建立救场者信誉和长期贡献激励体系。

## 团队成员与分工

| 成员 | 分工 |
| --- | --- |
| Yoyo | 产品设计、运营与宣传 |
| Jimmy | 项目推进、资料整理与整体协调 |
| Yunn | 智能合约开发与链上部署 |
| Caro | 前端开发与 Demo 实现 |
| 北海 | UI/UX 设计、交互测试与演示支持 |

## 演示材料

- 在线 Demo：[dont-ghost-me.vercel.app](https://dont-ghost-me.vercel.app/)
- GitHub：[Gos0lis/dont-ghost-me](https://github.com/Gos0lis/dont-ghost-me)
- Monad 合约：[查看 MonadVision](https://testnet.monadvision.com/address/0xc9e9db58b8dbca3f3078433dadb4808dd2d844a3)

## License

本项目使用 [MIT License](./LICENSE)。
