// Run: node --experimental-default-type=module tests/cache-check.mjs
import assert from 'node:assert/strict'
import { mock } from 'node:test'
import { StatsCache } from '../src/services/stats-cache.service.js'
import { App } from '../src/app.js'
import { Logger } from '../src/services/logger.service.js'

const originalChrome = globalThis.chrome
const originalWarn = Logger.warn
const warnings = []
Logger.warn = (...args) => warnings.push(args.join(' '))
const values = {}
const now = Date.UTC(2026, 9, 2, 12)
const tenMinutes = 600000
const snapshot = {
    loadedAt: now, gamesInfo: [{ id: 101, name: 'Игра A' }],
    lastTimestamp: Date.UTC(2026, 9, 2), dateRange: ['2025-09-02', '2026-10-02'],
    allGamesData: [{ options: { series: [{ id: 'Реклама', data: [{ x: Date.UTC(2026, 9, 2, 9), y: 100 }] }] } }],
    allPlayersData: [null], errors: ['Игроки: HTTP error: 503'],
    periodRevenues: { month_current: { 101: { totalRevenue: 100, advertising: 100, inApp: 0 } } }, periodErrors: {},
}
const storage = {
    async get(key) { return structuredClone(key === null ? values : { [key]: values[key] }) },
    async set(data) { Object.assign(values, structuredClone(data)) },
    async remove(keys) { for (const key of [].concat(keys)) delete values[key] },
}
globalThis.chrome = { storage: { local: storage } }
mock.timers.enable({ apis: ['Date'], now })
try {
    const cache = new StatsCache()
    await cache.write('111', snapshot, now)
    // A new widget must wait for the cabinet's account ID, then restore even if the user clicked early.
    const browserGlobals = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch }
    try {
        globalThis.window = { location: { hash: '#relation_context=-1', pathname: '/console/applications' } }
        globalThis.document = { querySelector: () => null }
        let networkCalls = 0
        globalThis.fetch = async () => { networkCalls++; throw new Error('Unexpected network request') }
        const app = new App()
        app.versionChecked = true
        const field = {}
        app.view = {
            element: null,
            isInDOM() { return this.element !== null },
            setNotice(message) { this.notice = message },
            showResults(row) { this.result = row },
        }
        app.domService.removeBlock = () => { app.view.element = null }
        app.domService.tryInsert = () => {
            app.view.element = { querySelector: () => field }
            app.onBlockInserted()
        }
        app.handleUrlChange(window.location.pathname)
        await app.loadData()
        assert.equal(app.rawData, null)
        assert.match(app.view.notice, /определяет аккаунт/)
        window.location.hash = '#relation_context=111'
        app.handleUrlChange(window.location.pathname)
        await new Promise(resolve => setTimeout(resolve, 0))
        assert.equal(app.view.result.amount, 100, 'F5 must restore the actual period income')
        assert.equal(app.updatedAt, now)
        assert.equal(networkCalls, 0, 'F5 and the queued click must not refetch metrics')
        window.location.hash = '#relation_context=222'
        app.handleUrlChange(window.location.pathname)
        await new Promise(resolve => setTimeout(resolve, 0))
        assert.equal(app.rawData, null, 'Switching to an uncached account must discard the rendered snapshot')
    } finally {
        for (const [key, value] of Object.entries(browserGlobals)) {
            if (value === undefined) delete globalThis[key]
            else globalThis[key] = value
        }
    }
    assert.equal((await cache.read('111')).data.periodRevenues.month_current[101].totalRevenue, 100)
    assert.equal((await cache.read('111')).data.allGamesData[0].options.series[0].data[0].x, Date.UTC(2026, 9, 2, 9))
    assert.equal((await cache.read('111')).data.allPlayersData[0], null)
    assert.equal(await cache.read('222'), null, 'Another account must never receive this snapshot')
    assert.equal(await cache.read(null), null, 'Unresolved accounts cannot use shared cache')
    mock.timers.setTime(now + tenMinutes - 1)
    assert.ok(await cache.read('111'), 'Cache stays usable until the 10-minute boundary')
    mock.timers.setTime(now + tenMinutes)
    assert.equal(await cache.read('111'), null, 'Cache expires at exactly 10 minutes')
    mock.timers.setTime(now)
    await cache.write('111', snapshot, now + 1)
    assert.equal(await cache.read('111'), null, 'Future timestamps must not extend validity')
    await cache.write('111', snapshot, now)
    values['ys_console_stats_v1:111'].context = '222'
    assert.equal(await cache.read('111'), null)
    await cache.write('111', snapshot, now)
    values['ys_console_stats_v1:111'].data.allGamesData[0].options.series[0].data[0].y = 'bad'
    assert.equal(await cache.read('111'), null, 'Corrupted metrics must not be rendered')
    await cache.write('111', snapshot, now)
    values['ys_console_stats_v1:111'].data.periodRevenues.month_current[101].advertising = 'bad'
    assert.equal(await cache.read('111'), null, 'Corrupted source details must not enter income calculations')
    await cache.write('111', { ...snapshot, loadedAt: Date.UTC(2026, 8, 30, 23, 59) }, Date.UTC(2026, 8, 30, 23, 59))
    mock.timers.setTime(Date.UTC(2026, 9, 1))
    assert.equal(await cache.read('111'), null, 'A new reporting month needs fresh period totals')
    mock.timers.setTime(now)
    await cache.write('111', snapshot, now)
    await cache.clear('111')
    assert.equal(await cache.read('111'), null, 'An account with no published games must not reuse old income')
    // Several accounts must not exhaust the storage quota with snapshots that can no longer be used.
    values.ys_version_cache = { version: '1.0.2' }
    await cache.write('333', snapshot, now)
    values['ys_console_stats_v1:222'] = { context: '222', updatedAt: now - tenMinutes, data: snapshot }
    await cache.write('111', snapshot, now)
    assert.equal(values['ys_console_stats_v1:222'], undefined, 'An expired snapshot of another account must be removed')
    assert.ok(values['ys_console_stats_v1:333'] && values['ys_console_stats_v1:111'], 'Fresh snapshots of other accounts must stay usable')
    assert.ok(values.ys_version_cache, 'Cleanup must not touch other extension data')

    // Browser APIs can return undefined and complete asynchronously through callbacks only.
    const callbackValues = {}
    globalThis.chrome = { runtime: {}, storage: { local: {
        get(key, done) { setTimeout(() => done({ [key]: structuredClone(callbackValues[key]) }), 0) },
        set(data, done) { setTimeout(() => { Object.assign(callbackValues, structuredClone(data)); done() }, 0) },
        remove(key, done) { setTimeout(() => { delete callbackValues[key]; done() }, 0) },
    } } }
    await cache.write('111', snapshot, now)
    assert.equal((await cache.read('111'))?.data.periodRevenues.month_current[101].totalRevenue, 100, 'Callback-only storage must restore the saved income')
    const callbackGet = chrome.storage.local.get
    let finishStaleRead
    callbackValues['ys_console_stats_v1:111'].updatedAt = now - tenMinutes
    chrome.storage.local.get = (key, done) => {
        if (key !== 'ys_console_stats_v1:111') return callbackGet(key, done)
        const captured = structuredClone(callbackValues[key])
        finishStaleRead = () => done({ [key]: captured })
    }
    const staleRead = cache.read('111')
    await cache.write('111', snapshot, now)
    finishStaleRead()
    assert.equal(await staleRead, null, 'An expired in-flight snapshot must not be used')
    chrome.storage.local.get = callbackGet
    assert.equal((await cache.read('111'))?.updatedAt, now, 'An old read must not delete the fresh cache saved by a manual refresh')
    await cache.clear('111')
    assert.equal(await cache.read('111'), null, 'Callback-only removal must finish before returning')
    chrome.storage.local.set = (data, done) => {
        chrome.runtime.lastError = { message: 'quota exceeded' }
        done()
        delete chrome.runtime.lastError
    }
    await cache.write('111', snapshot, now)
    assert.equal(callbackValues['ys_console_stats_v1:111'], undefined)
    assert.ok(warnings.some(message => message.includes('quota exceeded')), 'Callback runtime errors must be reported without breaking income rendering')

    globalThis.chrome = { storage: { local: storage } }
    storage.set = async () => { throw new Error('quota') }
    await cache.write('111', snapshot, now)
    storage.get = async () => { throw new Error('storage denied') }
    assert.equal(await cache.read('111'), null)
    delete globalThis.chrome
    assert.equal(await cache.read('111'), null)
    await cache.write('111', snapshot, now)
    console.log('Cache check passed: Promise/callback APIs, concurrent refresh, 10-minute TTL, accounts, calendar boundary, corruption, quota and unavailable storage.')
} finally {
    Logger.warn = originalWarn
    mock.timers.reset()
    if (originalChrome === undefined) delete globalThis.chrome
    else globalThis.chrome = originalChrome
}
