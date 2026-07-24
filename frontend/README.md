# 不要鸽我 · Web3 救场协议 Demo

“不要鸽我”把成员退出后的违约保证金转化为救场悬赏，让真正补上任务缺口的人获得奖励。

这是一个 React + Vite + TypeScript 前端 Demo。当前不连接真实合约，所有关键业务操作都通过统一的假合约服务执行，并使用 `localStorage` 模拟链上状态持久化。

## 启动

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

## 推荐演示顺序

### 场景一：黑客松救场

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

### 场景二：朋友旅行

1. 首页“更多使用场景”进入“朋友旅行”完整 Demo。
2. 以 Caro 身份点击“模拟 Momo 临时退出”，确认退出交易。
3. 观察 100 MON 从旅行保证金转入补救悬赏池。
4. 点击“将 100 MON 拆成 3 个悬赏”，确认依次发布三笔交易。
5. 查看 40 MON 寻找替补、40 MON 转卖门票、20 MON 修改酒店与行程。
6. 进入悬赏大厅；手机端可打开钱包菜单并切换到 Builder 07 继续领取任务。

页面顶部提供“重置 Demo”，可以随时恢复初始状态。

## 假合约架构

- `src/contracts/types.ts`：合约数据和交易类型。
- `src/contracts/mockAbi.ts`：未来真实合约函数结构。
- `src/services/contractService.ts`：页面和 Store 依赖的统一接口。
- `src/services/mockContractService.ts`：当前本地假合约实现。
- `src/store/useAppStore.ts`：调用合约服务、等待回执并刷新所有页面数据。

页面不直接读取或修改 `localStorage`。只有 `mockContractService.ts` 可以访问底层持久化数据。

未来接入真实合约时，新增 `viemContractService.ts` 并替换 `contractService.ts` 中的服务绑定即可；页面路由、组件流程和 Store 不需要重新设计。代码中已标注：

```ts
// TODO: Replace with wagmi writeContract
// TODO: Replace with viem readContract
// TODO: Replace mock receipt with publicClient.waitForTransactionReceipt
```

## 主要路由

- `/` 首页
- `/create` 创建共同承诺
- `/travel` 朋友旅行完整演示
- `/projects` 我的项目
- `/project/:projectId` 项目详情
- `/project/:projectId/create-bounty` 发布救场悬赏
- `/bounties` 救场悬赏大厅
- `/bounty/:bountyId` 悬赏详情
- `/my-tasks` 我的救场任务
- `/bounty/:bountyId/submit` 提交成果
- `/project/:projectId/review/:bountyId` 验收成果
- `/settlement-success` 结算成功
