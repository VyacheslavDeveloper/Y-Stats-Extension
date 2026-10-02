// Run: node --experimental-default-type=module tests/metrics-check.mjs
import assert from 'node:assert/strict'
import { mock } from 'node:test'
import { ApiService, normalizeAnalyticsData, normalizeRevenueTotals } from '../src/services/api.service.js'
import { App } from '../src/app.js'
import { CHART } from '../src/config/constants.js'
import { Logger } from '../src/services/logger.service.js'
import { aggregateRevenueData, prepareGamesTableData, prepareChartData } from '../src/utils/helpers.js'
import { formatDate, formatMoney } from '../src/utils/formatters.js'

// Synthetic values preserve the observed console cases without exposing account income.
const day = Date.UTC(2026, 8, 29)
const rawRevenue = amount => ({
    options: { series: [
        { id: 'adv', name: 'Реклама', data: [[day, amount]] },
        { name: 'Инап-покупки', data: [{ x: day, y: 0 }] },
        { name: 'Лидеры категории', graphType: 'category', data: [[day, 99999]] },
    ] },
    tooltip_total: { values: { [day]: amount } },
})
const revenue = amount => normalizeAnalyticsData(rawRevenue(amount), CHART.SLUG)
const players = count => normalizeAnalyticsData({ options: { series: [
    { name: 'Всего', data: [[day, count]] },
] } }, CHART.PLAYERS_SLUG)
const games = [{ id: 101, name: 'Игра A' }, { id: 202, name: 'Игра B' }]
const data = [revenue(10.25), revenue(7.50)]
const rows = prepareGamesTableData(data, games, day, day, 'day', [null, players(8)])
assert.equal(rows[0].totalRevenue, 10.25)
assert.equal(rows[0].players, null)
assert.equal(rows[0].revenuePerPlayer, null)
assert.equal(rows[1].totalRevenue, 7.50)
assert.equal(aggregateRevenueData(data, day).total, 17.75)
assert.equal(aggregateRevenueData([null, null], day).total, null)
assert.equal(prepareChartData(data, day, day).points[0].total, 17.75)
const sparse = { options: { series: [{ id: 'Реклама', data: [{ x: day - 86400000, y: 1 }] }] } }
assert.equal(prepareChartData([...data, sparse], day, day).points[0].total, 17.75)
assert.equal(prepareGamesTableData([...data, sparse], [...games, { id: 3 }], day, day, 'day')[2].totalRevenue, 0)
assert.equal(prepareGamesTableData(data, games, day + 86400000, day + 86400000, 'day')[0].totalRevenue, null)
assert.equal(prepareGamesTableData([null], games, day, day, 'day', [players(100)])[0].players, 100)
assert.equal(formatMoney(null), '—')
assert.equal(formatDate(new Date(Date.UTC(2026, 8, 30, 23, 59))), '30 сентября 2026 г.')
assert.deepEqual(ApiService.getAnalyticsDateRange(new Date('2026-03-31T12:00:00Z')), ['2025-02-28', '2026-03-31'])
assert.throws(() => normalizeAnalyticsData({}, CHART.SLUG))
assert.throws(() => normalizeAnalyticsData({ options: { series: [{ name: 'Новый источник', data: [[day, 1]] }] } }, CHART.SLUG))
assert.throws(() => normalizeAnalyticsData({ ...rawRevenue(10), tooltip_total: { values: { [day]: 20 } } }, CHART.SLUG))
const nullPoint = normalizeAnalyticsData({ options: { series: [{ name: 'Реклама', data: [[day, null]] }] } }, CHART.SLUG)
assert.equal(aggregateRevenueData([nullPoint], day).total, null)
// Rounded daily values total 4.24; the authoritative period total is 4.23.
const roundedDays = { options: { series: [{ id: 'Реклама', data: [{ x: day - 86400000, y: 2.12 }, { x: day, y: 2.12 }] }] } }
const precise = normalizeRevenueTotals({ currency: 'RUB', items: [
    { game_id: 101, earn: '4.23', adv: '4.23', inapp: '0' },
] })
assert.equal(prepareGamesTableData([roundedDays], games, day - 86400000, day, 'week')[0].totalRevenue, 4.24)
assert.equal(prepareGamesTableData([roundedDays], games, day - 86400000, day, 'week', null, precise)[0].totalRevenue, 4.23)
assert.equal(normalizeRevenueTotals({ items: [{ game_id: 1, earn: null }] })[1].totalRevenue, null)
assert.throws(() => normalizeRevenueTotals({ currency: 'USD', items: [] }))

// Verify the actual request contract, then the loading path with one failed players request.
const originalGlobals = { window: globalThis.window, document: globalThis.document }
globalThis.window = { location: { hash: '#relation_context=12345' } }
assert.equal(ApiService.getRelationContext(), '12345')
window.location.hash = '#relation_context=-1'
assert.equal(ApiService.getRelationContext(), null)
window.location.hash = '#relation_context=12345'
globalThis.document = { querySelector: () => null, querySelectorAll: () => [] }
const originalFetch = globalThis.fetch
const originalLogError = Logger.error
mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 8, 29, 12) })
try {
    globalThis.fetch = async (url, options) => {
        assert.ok(url.endsWith('/console/api/metrics-engine/analytics/data'))
        assert.equal(options.credentials, 'include')
        assert.equal(options.method, 'POST')
        assert.equal(options.headers['x-csrf-token'], 'test-token')
        assert.deepEqual(JSON.parse(options.body), {
            slug: 'purchase_amount', game_id: 101, lang: 'ru',
            mobile_slice: '__total__', country_slice: '__total__', date_range: ['2026-09-28', '2026-09-29'],
        })
        return { ok: true, json: async () => rawRevenue(10.25) }
    }
    assert.equal((await ApiService.fetchAnalyticsData('test-token', 101, CHART.SLUG, ['2026-09-28', '2026-09-29'])).options.series[0].data[0].y, 10.25)
    globalThis.fetch = async (url, options) => {
        const parsed = new URL(url)
        assert.equal(parsed.pathname, '/console/api/metrics-engine/total/data')
        assert.deepEqual(parsed.searchParams.getAll('date_range'), ['2026-09-01', '2026-09-30'])
        assert.equal(parsed.searchParams.get('relation_context'), '12345')
        assert.equal(parsed.searchParams.get('slug'), 'total_earn')
        assert.equal(options.credentials, 'include')
        return { ok: true, json: async () => ({ items: [{ game_id: 101, earn: 4.23, adv: 4.23, inapp: 0 }] }) }
    }
    assert.equal((await ApiService.fetchRevenueTotals(['2026-09-01', '2026-09-30']))[101].totalRevenue, 4.23)

    // Exercise fetch -> ApiService -> App -> rendered result; only external I/O is replaced.
    const requestedPeriods = []
    globalThis.fetch = async (url, options) => {
        const parsed = new URL(url)
        assert.equal(options.credentials, 'include')
        if (parsed.pathname === '/console/api/applications') {
            return { ok: true, json: async () => games.map(game => ({
                rtx_id: game.id, 'published-version': { title: { ru: game.name } },
            })) }
        }
        if (parsed.pathname === '/console/api/metrics-engine/analytics/data') {
            const { game_id: id, slug } = JSON.parse(options.body)
            assert.ok(id === 101 || id === 202)
            if (slug === 'players') {
                if (id === 101) return { ok: false, status: 503 }
                return { ok: true, json: async () => ({ options: { series: [{ name: 'Всего', data: [[day, 8]] }] } }) }
            }
            assert.equal(slug, 'purchase_amount')
            return { ok: true, json: async () => rawRevenue(id === 101 ? 10.25 : 7.50) }
        }
        assert.equal(parsed.pathname, '/console/api/metrics-engine/total/data')
        const range = parsed.searchParams.getAll('date_range')
        requestedPeriods.push(range)
        const includesRecordedDay = range[0] <= '2026-09-29' && range[1] >= '2026-09-29'
        return { ok: true, json: async () => ({ items: games.map((game, index) => ({
            game_id: game.id, earn: includesRecordedDay ? [10.25, 7.50][index] : 0,
            adv: includesRecordedDay ? [10.25, 7.50][index] : 0, inapp: 0,
        })) }) }
    }
    Logger.error = () => {}
    const dateElement = { textContent: '' }
    const app = Object.assign(Object.create(App.prototype), {
        csrfToken: 'test-token', isLoading: false, settings: { requestDelay: 0 },
        selectedPeriod: 'month_current', activeTab: 'overview', dateSelectionMode: 'period', selectedDate: null,
        _setupEventHandlers() {},
        view: {
            element: { querySelector: () => dateElement },
            showInitialLoading() {}, showLoadingProgress() {},
            showButton() { assert.fail('Loading unexpectedly failed') },
            setNotice(message) { this.notice = message },
            showResults(result) { this.result = result },
        },
    })
    await app.loadData()
    assert.equal(app.rawData.allGamesData[0].options.series[0].data[0].y, 10.25)
    assert.equal(app.rawData.allPlayersData[0], null)
    assert.equal(app.view.result.amount, 17.75)
    assert.equal(app.view.result.players, null)
    assert.match(app.view.notice, /Игра A: игроки.*HTTP error: 503/)
    assert.ok(requestedPeriods.some(([start, end]) => start === '2026-09-01' && end === '2026-09-29'))
    assert.equal(app.aggregateDataForPeriod(app.rawData, 'month_prev').amount, 0)
    assert.equal(app.dateSelectionMode, 'period')
    assert.equal(app.selectedDate, null)
    assert.equal(app.selectedPeriod, 'month_current')
    app.updateDataForSpecificDate(day)
    assert.equal(app.view.result.amount, 17.75)
    assert.equal(app.view.result.players, null)
    const calendar = { ...app.rawData, loadedAt: Date.UTC(2026, 9, 2) }
    assert.equal(app.getPeriodRange(calendar, 'month_current').start, Date.UTC(2026, 9, 1))
    assert.equal(app.getPeriodRange(calendar, 'month_prev').end, Date.UTC(2026, 8, 30, 23, 59, 59, 999))
    app.rawData = { ...calendar, periodRevenues: {}, periodErrors: { month_prev: 'totals unavailable' } }
    assert.equal(app.aggregateDataForPeriod(app.rawData, 'month_prev').amount, 17.75)
    app.updateNotice(app.getPeriodRange(app.rawData, 'month_prev'), 'month_prev')
    assert.match(app.view.notice, /разница округления/)
    console.log('Metrics check passed: current API, exact period totals, daily income, partial failures, dates.')
} finally {
    globalThis.fetch = originalFetch
    Logger.error = originalLogError
    mock.timers.reset()
    for (const [key, value] of Object.entries(originalGlobals)) {
        if (value === undefined) delete globalThis[key]
        else globalThis[key] = value
    }
}
