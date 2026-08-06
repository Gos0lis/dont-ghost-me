import { defineChain } from 'viem'
import { monadTestnet } from 'viem/chains'

/** Local Anvil (default Foundry). */
export const anvilChain = defineChain({
  id: 31_337,
  name: 'Anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['http://localhost:8545'] },
  },
})

export function getConfiguredChain() {
  const id = Number(import.meta.env.VITE_CHAIN_ID ?? 31_337)
  const rpcRaw = (import.meta.env.VITE_RPC_URL as string | undefined) ?? 'http://localhost:8545'
  const rpc =
    typeof window !== 'undefined' && rpcRaw.startsWith('/')
      ? `${window.location.origin}${rpcRaw}`
      : rpcRaw
  const name = (import.meta.env.VITE_CHAIN_NAME as string | undefined) ?? 'Local Anvil'
  const symbol = (import.meta.env.VITE_NATIVE_SYMBOL as string | undefined) ?? 'ETH'

  if (id === anvilChain.id) {
    return {
      ...anvilChain,
      name,
      rpcUrls: { default: { http: [rpc] } },
      nativeCurrency: { ...anvilChain.nativeCurrency, symbol, name: symbol },
    }
  }

  if (id === monadTestnet.id) {
    return {
      ...monadTestnet,
      name: name || monadTestnet.name,
      rpcUrls: { default: { http: [rpc || monadTestnet.rpcUrls.default.http[0]] } },
      nativeCurrency: {
        ...monadTestnet.nativeCurrency,
        symbol: symbol || monadTestnet.nativeCurrency.symbol,
        name: symbol || monadTestnet.nativeCurrency.name,
      },
      blockExplorers: monadTestnet.blockExplorers ?? {
        default: { name: 'MonadVision', url: 'https://testnet.monadvision.com' },
      },
    }
  }

  return defineChain({
    id,
    name,
    nativeCurrency: { name: symbol, symbol, decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  })
}

export function getContractAddress(): `0x${string}` {
  const address = import.meta.env.VITE_CONTRACT_ADDRESS as string | undefined
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error('缺少有效的 VITE_CONTRACT_ADDRESS，请先本地部署合约并写入 frontend/.env.local')
  }
  return address as `0x${string}`
}

/** mock | local | chain — local/chain both use viem; only RPC/address differ. */
export function getChainMode(): 'mock' | 'local' | 'chain' {
  const mode = (import.meta.env.VITE_CHAIN_MODE as string | undefined)?.toLowerCase()
  if (mode === 'local' || mode === 'chain') return mode
  return 'mock'
}

export function usesOnChainBackend() {
  return getChainMode() !== 'mock'
}

/** Display unit: mock keeps product MON branding; local/chain follow env / chain config. */
export function getNativeSymbol(): string {
  if (getChainMode() === 'mock') return 'MON'
  return (import.meta.env.VITE_NATIVE_SYMBOL as string | undefined) ?? getConfiguredChain().nativeCurrency.symbol
}

/** Local Anvil demo only has 3 fixed accounts — do not create a 4th member silently. */
export const LOCAL_DEMO_MEMBER_LIMIT = 3
