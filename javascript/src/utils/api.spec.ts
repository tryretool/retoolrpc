import http from 'http'
import zlib from 'zlib'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { RetoolAPI } from './api'

describe('RetoolAPI', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('registerAgent uses globalThis.fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ versionHash: 'abc' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const api = new RetoolAPI({
      hostUrl: 'https://example.retool.com',
      apiKey: 'token',
      pollingTimeoutMs: 1000,
    })

    const response = await api.registerAgent({
      resourceId: 'resource-id',
      environmentName: 'production',
      version: '0.0.1',
      agentUuid: 'agent-uuid',
      operations: {},
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe('https://example.retool.com/api/v1/retoolrpc/registerAgent')
    expect(response.ok).toBe(true)
    await expect(response.json()).resolves.toEqual({ versionHash: 'abc' })
  })

  // Regression for RE-2830: node-fetch@2 throws FetchError Premature close on some Node 24
  // gzip responses. Native fetch must consume a gzip registerAgent body cleanly.
  // Node 18 under Vitest can take several seconds for a local fetch round-trip.
  test(
    'registerAgent consumes a gzip Content-Encoding response body',
    async () => {
      const payload = JSON.stringify({ versionHash: 'gzip-version-hash' })
      const gzipBody = zlib.gzipSync(payload)

      const server = http.createServer((req, res) => {
        // Drain the request body before responding so fetch does not stall on an unread POST.
        req.resume()
        req.on('end', () => {
          expect(req.method).toBe('POST')
          expect(req.url).toBe('/api/v1/retoolrpc/registerAgent')
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Content-Encoding': 'gzip',
            'Content-Length': String(gzipBody.length),
          })
          res.end(gzipBody)
        })
      })

      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve())
      })

      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('Expected TCP server address')
      }

      try {
        const api = new RetoolAPI({
          hostUrl: `http://127.0.0.1:${address.port}`,
          apiKey: 'token',
          pollingTimeoutMs: 1000,
        })

        const response = await api.registerAgent({
          resourceId: 'resource-id',
          environmentName: 'production',
          version: '0.0.1',
          agentUuid: 'agent-uuid',
          operations: {},
        })

        expect(response.ok).toBe(true)
        await expect(response.json()).resolves.toEqual({ versionHash: 'gzip-version-hash' })
      } finally {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()))
        })
      }
    },
    20_000,
  )
})
