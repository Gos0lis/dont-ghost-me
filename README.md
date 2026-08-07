# 不要鸽我 · Don't Ghost Me

> 让成员退出后的违约保证金，变成奖励救场者的悬赏池。

[![CI](https://github.com/Gos0lis/dont-ghost-me/actions/workflows/test.yml/badge.svg)](https://github.com/Gos0lis/dont-ghost-me/actions/workflows/test.yml)
[![Solidity](https://img.shields.io/badge/Solidity-%5E0.8.20-363636?logo=solidity)](./src/DontGhostMe.sol)
[![Foundry](https://img.shields.io/badge/Built%20with-Foundry-FFB000)](https://book.getfoundry.sh/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](#license)

**在线 Demo**：<https://dont-ghost-me.vercel.app>

> [!IMPORTANT]
> 前端支持三种后端：`mock`（本地演示）、`local`（Anvil）、`chain`（Monad Testnet + MetaMask / Rabby）。
> 当前 Monad Testnet 合约：[`0x9f9577bb9244a933ce71f03cabdc3bf325a93b69`](https://testnet.monadvision.com/address/0x9f9577bb9244a933ce71f03cabdc3bf325a93b69)。
> 线上 / `vite build` 默认读取 [`frontend/.env.production`](./frontend/.env.production)（chain 模式）；私钥只放本地 `.env.monad`，不要提交。
> 请勿向 Demo / 测试网钱包发送主网资产。

---

## 项目是什么

「不要鸽我」是面向多人小团队的 Web3 协作承诺协议。成员创建共同承诺并锁定保证金；有人中途退出（「鸽」）时，其保证金进入**救场池**，用于发布悬赏、奖励真正补位的人。项目正常结束后，由创建者结算，各成员保证金自动退回。

典型场景：黑客松队友临时离队、朋友出行临时取消——退出有代价，补位有回报。

### 产品流程（简述）

1. **创建承诺**：发起人设定场景、保证金与成员席位，把邀请链接发给队友。
2. **成员确认**：每人用自己的钱包加入并锁定保证金（仅创建者可最终点「任务完成」）。
3. **履约或退出**：正常走完则创建者结算退款；有人退出则保证金进救场池。
4. **救场悬赏**：发布 / 领取 / 提交 / 验收支付，补齐遗留任务。
5. **结束承诺**：救场结清后，创建者提交完成，退回剩余保证金。

### 技术栈

| 层 | 技术 |
| --- | --- |
| 合约 | Solidity ^0.8.20 · Foundry（Forge / Cast / Anvil） |
| 前端 | React · TypeScript · Vite · V11 设计壳 |
| 链交互 | viem（`mock` / `local` / `chain` 统一经 `contractService`） |
| 目标链 | 本地 Anvil；Monad Testnet（原生代币 MON） |
| CI | GitHub Actions（`forge fmt` / `build` / `test`） |

---

## 仓库结构

```
dont-ghost-me/
├── src/DontGhostMe.sol          # 主合约：项目、加入/退出、悬赏、驱逐、结算
├── src/IDontGhostMe.sol         # 接口
├── test/                        # Foundry 功能与安全测试
├── script/DontGhostMe.s.sol     # 本地部署脚本
├── frontend/                    # React Demo（DesignApp → designBackend → contractService）
│   ├── scripts/deploy-monad.mjs # Monad Testnet 一键部署并写 .env.local
│   └── src/
│       ├── design/              # V11 页面壳与交互接线
│       ├── services/            # mock / viem / 流程编排
│       └── contracts/           # ABI、链配置、类型
└── foundry.toml
```

前端路由：`/` 首页 · `/promises` 我的承诺 · `/rescue` 救场大厅 · `/pigeon` 我的信鸽。

---

## 开发流程

### 1. 克隆与合约

```bash
git clone --recurse-submodules https://github.com/Gos0lis/dont-ghost-me.git
cd dont-ghost-me

forge build
forge test
forge fmt
```

### 2. 前端：三种模式任选其一

环境变量模板见 [`frontend/.env.example`](./frontend/.env.example)。用 `VITE_CHAIN_MODE` 切换后端：

| 模式 | 用途 | 说明 |
| --- | --- | --- |
| `mock` | 产品 / UI 演示 | localStorage，无需链 |
| `local` | Anvil 联调 | 最多约 3 人演示账户 |
| `chain` | Monad Testnet | 注入钱包签名真实交易 |

**Mock 演示**

```bash
cd frontend
cp .env.example .env.local   # VITE_CHAIN_MODE=mock
npm install
npm run dev
```

打开 <http://localhost:5173/>。双击品牌可重置演示数据。

**Monad Testnet**

```bash
forge build
# 仓库根目录准备 .env.monad（含 PRIVATE_KEY，需有测试 MON）
node frontend/scripts/deploy-monad.mjs

cd frontend && npm run dev
```

连接 MetaMask / Rabby → 切到 Monad Testnet（Chain ID `10143`）。测试币：<https://faucet.monad.xyz>

线上构建（Vercel）会读取 `frontend/.env.production` 中的合约地址；若重新部署合约，请同步更新该文件并推送。

**本地 Anvil**

```bash
# 终端 1
anvil

# 终端 2：部署后把地址写入 frontend/.env.local
forge script script/DontGhostMe.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
# VITE_CHAIN_MODE=local
# VITE_CONTRACT_ADDRESS=0x...
# VITE_RPC_URL=/anvil
# VITE_NATIVE_SYMBOL=ETH

cd frontend && npm run dev
```

Anvil 重启后需重新部署；双击品牌只清浏览器索引，清不掉链上状态。

### 3. 建议自测路径

1. 创建承诺 → 复制成员邀请链接 → 另一钱包打开并加入锁定。  
2. 全员加入后，用**创建者**钱包点「任务完成」（非创建者会被前端拦截并提示）。  
3. 或：已加入成员退出 → 救场大厅领取 / 提交 → 验收支付 → 再结算承诺。

### 4. 生产构建

```bash
cd frontend
npm run build
```

---

## 智能合约要点

保证金与悬赏奖励使用原生代币（Monad 上为 MON）。

- **项目**：`createProject` → 成员 `joinProject` 锁定保证金 → `leaveProject` 进救场池  
- **悬赏**：`createBounty` → `claimBounty` → `submitWork` → `approveWork` / `rejectWork`  
- **结算**：仅项目 owner 可 `finishProject` / `cancelProject`；完成后自动退还活跃成员保证金  
- **驱逐**：提案、投票、执行与 bond 罚没（见合约与测试）

完整接口：[`src/IDontGhostMe.sol`](./src/IDontGhostMe.sol)。Foundry 文档：<https://book.getfoundry.sh/>

---

## 团队

| 成员 | 角色 |
| --- | --- |
| Yoyo | 设计 / 运营宣传 |
| Jimmy | 记录与整体推进 |
| Yunn | 智能合约 |
| Caro | 前端与 Demo |
| 北海 | UI/UX 与测试 |

目标用户：黑客松小队、出行朋友群等需要共同履约的小团队。

---

## License

主合约 SPDX：`MIT`。仓库根目录 `LICENSE` 文件待补充。
