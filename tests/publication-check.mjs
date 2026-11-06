import assert from 'node:assert/strict'
import { test } from 'node:test'
import { API } from '../src/config/constants.js'
import { ApiService } from '../src/services/api.service.js'
import { fetchPublicationDates, normalizePublicationDates } from '../src/services/publication.service.js'

test('catalogue publication seconds become milliseconds; absent or invalid dates remain unknown', () => {
    assert.deepEqual(normalizePublicationDates({ games: [
        { appID: 101, firstPublished: 1790816400 },
        { appID: 202, firstPublished: 0 },
        { appID: 303, firstPublished: '1790816400' },
        { appID: 404, firstPublished: Number.MAX_SAFE_INTEGER },
        { appID: 999, firstPublished: 1790816400 },
    ] }, [101, 202, 303, 404, 505]), {
        101: Date.UTC(2026, 9, 1, 1), 202: null, 303: null, 404: null, 505: null,
    })
    assert.throws(() => normalizePublicationDates({}, [101]), /формат/)
})

test('content request reaches the worker without credentials and reports network, sender and runtime failures', async () => {
    const originalFetch = globalThis.fetch
    const originalChrome = globalThis.chrome
    let listener
    let requests = 0
    const runtime = {
        id: 'test-extension',
        onMessage: { addListener(value) { listener = value } },
        sendMessage(message, callback) {
            listener(message, { id: this.id, url: API.BASE_URL + API.ENDPOINTS.CONSOLE }, callback)
        },
    }
    globalThis.chrome = { runtime }
    try {
        await import('../background.js')
        globalThis.fetch = async (url, options) => {
            requests++
            const endpoint = new URL(url)
            assert.equal(endpoint.origin, 'https://yandex.ru')
            assert.equal(endpoint.pathname, '/games/api/catalogue/v2/get_games')
            assert.equal(endpoint.search, '?lang=ru&draft=false')
            assert.equal(options.method, 'POST')
            assert.equal(options.credentials, 'omit')
            assert.deepEqual(options.headers, { 'Content-Type': 'application/json' })
            assert.deepEqual(JSON.parse(options.body), { appIDs: [101, 202], format: 'long' })
            return { ok: true, json: async () => ({ games: [{ appID: 101, firstPublished: 1790816400 }] }) }
        }
        assert.deepEqual(await ApiService.fetchPublicationDates([101, 202]), { 101: 1790816400000, 202: null })
        for (const ids of [[], [0], ['101'], Array(101).fill(101)]) {
            await assert.rejects(fetchPublicationDates(ids), /список/)
        }
        for (const sender of [
            { id: 'other-extension', url: API.BASE_URL + API.ENDPOINTS.CONSOLE },
            { id: runtime.id, url: 'about:blank' },
            { id: runtime.id, url: API.BASE_URL + '/' },
            { id: runtime.id, url: 'invalid' },
        ]) {
            const response = await new Promise(resolve => listener({ type: 'getPublicationDates', gameIds: [101] }, sender, resolve))
            assert.match(response.error, /источник/)
        }
        assert.equal(requests, 1, 'Rejected requests must never reach the network')
        globalThis.fetch = async () => ({ ok: false, status: 503 })
        await assert.rejects(ApiService.fetchPublicationDates([101]), /503/)
        globalThis.fetch = async () => { throw new DOMException('Timed out', 'AbortError') }
        await assert.rejects(ApiService.fetchPublicationDates([101]), /время ожидания/)
        runtime.sendMessage = (_message, callback) => {
            runtime.lastError = { message: 'Worker unavailable' }
            callback()
            delete runtime.lastError
        }
        await assert.rejects(ApiService.fetchPublicationDates([101]), /Worker unavailable/)
        runtime.sendMessage = (_message, callback) => callback({})
        await assert.rejects(ApiService.fetchPublicationDates([101]), /Не удалось/)
    } finally {
        globalThis.fetch = originalFetch
        if (originalChrome === undefined) delete globalThis.chrome
        else globalThis.chrome = originalChrome
    }
})
