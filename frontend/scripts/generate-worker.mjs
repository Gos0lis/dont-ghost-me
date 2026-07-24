import { mkdir, writeFile } from 'node:fs/promises'

const source = `const fallback = (request) => {
  const url = new URL(request.url)
  url.pathname = "/"
  return new Request(url, request)
}

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request)
    if (response.status !== 404) return response
    return env.ASSETS.fetch(fallback(request))
  },
}
`

await mkdir(new URL('../dist/server/', import.meta.url), { recursive: true })
await writeFile(new URL('../dist/server/index.js', import.meta.url), source)
