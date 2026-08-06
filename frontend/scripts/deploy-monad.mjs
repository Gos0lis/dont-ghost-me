/**
 * Deploy DontGhostMe to Monad Testnet via viem.
 *
 * Usage (from repo root):
 *   node frontend/scripts/deploy-monad.mjs
 *
 * Requires `.env.monad` with:
 *   PRIVATE_KEY=0x...
 *   MONAD_RPC_URL=https://testnet-rpc.monad.xyz
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPublicClient, createWalletClient, http, formatEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { monadTestnet } from 'viem/chains'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')

function loadEnvFile(path) {
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const i = trimmed.indexOf('=')
    if (i < 0) continue
    out[trimmed.slice(0, i)] = trimmed.slice(i + 1)
  }
  return out
}

const env = {
  ...loadEnvFile(resolve(root, '.env.monad')),
  ...process.env,
}

const privateKey = env.PRIVATE_KEY
const rpcUrl = env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz'
if (!privateKey || !/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
  console.error('Missing or invalid PRIVATE_KEY in .env.monad')
  process.exit(1)
}

const artifactPath = resolve(root, 'out/DontGhostMe.sol/DontGhostMe.json')
if (!existsSync(artifactPath)) {
  console.error('Contract artifact missing. Run `forge build` first.')
  process.exit(1)
}

const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'))
const account = privateKeyToAccount(privateKey)
const chain = {
  ...monadTestnet,
  rpcUrls: { default: { http: [rpcUrl] } },
}

const publicClient = createPublicClient({ chain, transport: http(rpcUrl) })
const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) })

const balance = await publicClient.getBalance({ address: account.address })
console.log('Deployer:', account.address)
console.log('Balance:', formatEther(balance), 'MON')
console.log('RPC:', rpcUrl)

if (balance === 0n) {
  console.error('\nDeployer has 0 MON. Fund it from https://faucet.monad.xyz then re-run.')
  process.exit(2)
}

console.log('\nDeploying DontGhostMe…')
const hash = await walletClient.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object,
  account,
  chain,
})
console.log('Tx:', hash)

const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 })
if (receipt.status !== 'success' || !receipt.contractAddress) {
  console.error('Deployment failed', receipt)
  process.exit(1)
}

const address = receipt.contractAddress
console.log('Contract:', address)
console.log('Block:', receipt.blockNumber.toString())
console.log('Explorer:', `https://testnet.monadvision.com/address/${address}`)

const frontendEnv = [
  'VITE_CHAIN_MODE=chain',
  `VITE_RPC_URL=${rpcUrl}`,
  'VITE_CHAIN_ID=10143',
  'VITE_CHAIN_NAME=Monad Testnet',
  'VITE_NATIVE_SYMBOL=MON',
  `VITE_CONTRACT_ADDRESS=${address}`,
  `VITE_DEPLOY_FROM_BLOCK=${receipt.blockNumber.toString()}`,
].join('\n') + '\n'

writeFileSync(resolve(root, 'frontend/.env.local'), frontendEnv)
console.log('\nWrote frontend/.env.local')
console.log('Restart `npm run dev` to pick up the new address.')
