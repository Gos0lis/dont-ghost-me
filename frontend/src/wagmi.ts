import { createConfig, http } from 'wagmi'
import { getConfiguredChain, getChainMode } from './contracts/chainConfig'
import { mainnet, sepolia } from 'wagmi/chains'

const mode = getChainMode()
const localOrRemote = getConfiguredChain()

export const config = createConfig({
  chains: mode === 'mock' ? [mainnet, sepolia] : [localOrRemote, mainnet, sepolia],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    ...(mode === 'mock'
      ? {}
      : {
          [localOrRemote.id]: http(localOrRemote.rpcUrls.default.http[0]),
        }),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
