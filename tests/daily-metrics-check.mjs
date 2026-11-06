import assert from 'node:assert/strict'
import { test } from 'node:test'
import { App } from '../src/app.js'
import { StatsView } from '../src/views/stats-view.js'
import { normalizeAnalyticsData } from '../src/services/api.service.js'
import { CHART } from '../src/config/constants.js'
import { formatMoney } from '../src/utils/formatters.js'
import { aggregateRevenueData, aggregatePlayersData, prepareGamesTableData, prepareChartData, extractUniqueTimestamps } from '../src/utils/helpers.js'

const day = Date.UTC(2026, 8, 30)
const dayMs = 86400000
const revenue = (points) => normalizeAnalyticsData({ options: { series: [
    { name: 'Реклама', data: points },
    { name: 'Инап-покупки', data: points.map(([x, y]) => [x, y === null ? null : 0]) },
] } }, CHART.SLUG)
const players = points => normalizeAnalyticsData({ options: { series: [{ name: 'Всего', data: points }] } }, CHART.PLAYERS_SLUG)
const games = [{ id: 101, name: 'Game A' }, { id: 202, name: 'Game B' }]

test('missing revenue with zero players preserves known income without claiming lost data; request failures stay explicit', () => {
    const allGamesData = [revenue([[day, 10.25]]), revenue([[day, null]])]
    const app = Object.assign(Object.create(App.prototype), {
        rawData: { allGamesData, allPlayersData: [players([[day, 8]]), players([[day, 0]])], gamesInfo: games, lastTimestamp: day },
        activeTab: 'overview', _setupEventHandlers() {},
        view: { element: { querySelector: () => null }, showResults(value) { this.result = value }, setNotice(value) { this.notice = value } },
    })
    app.updateDataForSpecificDate(day)
    assert.equal(app.view.result.amount, 10.25)
    assert.equal(app.view.result.partial, true)
    assert.match(app.view.notice, /нет значения дохода/i)
    assert.doesNotMatch(app.view.notice, /Доход неполный/)
    app.updateDataForSpecificDate(day + 9 * 3600000)
    assert.equal(app.view.result.amount, 10.25)
    assert.doesNotMatch(app.view.notice, /ещё не доступны/)
    const point = prepareChartData(allGamesData, day, day).points[0]
    assert.equal(point.total, 10.25)
    assert.equal(point.partial, true)
    const tooltip = new StatsView()._getTooltipConfig([point])
    assert.doesNotMatch(tooltip.callbacks.label({ dataIndex: 0, dataset: { label: 'Всего' }, parsed: { y: 10.25 } }), /неполн|сбой/i)
    assert.equal(aggregateRevenueData([null, allGamesData[0]], day).total, 10.25)
    assert.equal(aggregateRevenueData([allGamesData[1]], day).total, null)
    app.rawData.errors = ['Game B: доход — HTTP error: 503']
    app.updateDataForSpecificDate(day)
    assert.match(app.view.notice, /Не загружено метрик: 1/)
    assert.match(app.view.notice, /503/)
})

test('missing and null days stay unknown, while a recorded zero stays zero', () => {
    const sparse = revenue([[day - dayMs, 5], [day + dayMs, 7]])
    const zero = revenue([[day, 0]])
    assert.equal(prepareGamesTableData([sparse], games, day, day, 'day')[0].totalRevenue, null)
    assert.equal(aggregateRevenueData([zero], day).total, 0)
    const point = prepareChartData([sparse], day - dayMs, day + dayMs).points[1]
    assert.equal(point.timestamp, day)
    assert.equal(point.total, null)
    assert.equal(prepareChartData([revenue([[day, null]])], day, day).points[0].total, null)
    const playerData = players([[day + dayMs, 8]])
    const row = prepareGamesTableData([revenue([[day, 5]])], games, day, day, 'day', [playerData])[0]
    assert.equal(row.players, null)
    assert.equal(row.revenuePerPlayer, null)
    assert.equal(aggregatePlayersData([players([[day, 0]])], day), 0)
    assert.equal(prepareGamesTableData([revenue([])], games, day, day, 'week')[0].totalRevenue, null)
    assert.equal(prepareGamesTableData([sparse], games, day, day, 'week')[0].totalRevenue, null)
})

test('partial chart points show coverage and missing games, while complete zero income stays unmarked', () => {
    const chart = prepareChartData([
        revenue([[day, 10], [day + dayMs, 0], [day + 2 * dayMs, 4]]),
        revenue([[day, null], [day + dayMs, 0], [day + 2 * dayMs, 6]]),
    ], day, day + 2 * dayMs, games)
    const view = new StatsView()
    const tooltip = view._getTooltipConfig(chart.points).callbacks
    assert.deepEqual(tooltip.afterBody([{ dataIndex: 0 }]), ['Доход указан у 1 из 2 игр', 'Без значения дохода:', 'Game B', 'Причина отсутствия значения не указана.'])
    assert.deepEqual(tooltip.afterBody([{ dataIndex: 1 }]), [])
    const dataset = view._createDatasetConfig('Всего', chart.points.map(p => p.total), '#FFFFFF', null, {}, chart.points)
    assert.ok(dataset.pointRadius[0] > 0)
    assert.notEqual(dataset.pointBackgroundColor[0], dataset.pointBackgroundColor[1])
    assert.deepEqual(dataset.segment.borderDash({ p0DataIndex: 0, p1DataIndex: 1 }), [6, 4])
    assert.deepEqual(dataset.segment.borderDash({ p0DataIndex: 1, p1DataIndex: 2 }), [])
    assert.equal(chart.points[1].total, 0)
    assert.equal(chart.points[1].partial, false)
    const failed = prepareChartData([null, revenue([[day, 0]])], day, day, games)
    assert.deepEqual(failed.points[0].missingGames, ['Game A'])
    assert.equal(failed.points[0].gamesCount, 2)
})

test('calendar dates align 09:00 revenue with midnight players without rewriting source timestamps', () => {
    const input = revenue([[day + 9 * 3600000, 10.25], [day + dayMs + 9 * 3600000, 7.50]])
    const restored = JSON.parse(JSON.stringify(input))
    const data = [restored, revenue([[day, 2]])]
    const row = prepareGamesTableData([restored], games, day, day, 'day', [players([[day, 8]])])[0]
    assert.equal(row.totalRevenue, 10.25)
    assert.equal(row.players, 8)
    const chart = prepareChartData(data, day, day)
    assert.equal(chart.points.length, 1)
    assert.equal(chart.points[0].total, 12.25)
    assert.equal(extractUniqueTimestamps(data).length, 2)
    assert.equal(restored.options.series[0].data[0].x, day + 9 * 3600000)
    const september = prepareGamesTableData([restored], games, day, day + dayMs - 1, 'month_prev')[0]
    assert.equal(september.totalRevenue, 10.25)
})

test('games before publication are excluded from missing income, including after JSON restoration, but publication-day gaps remain', () => {
    const gamesWithDates = [games[0], { ...games[1], publishedAt: day + dayMs + 18 * 3600000 }]
    const data = JSON.parse(JSON.stringify([revenue([[day, 10], [day + dayMs, 11]]), null]))
    const info = JSON.parse(JSON.stringify(gamesWithDates))
    const chart = prepareChartData(data, day, day + dayMs, info)
    assert.equal(chart.points[0].total, 10)
    assert.equal(chart.points[0].partial, false)
    assert.equal(chart.points[0].gamesCount, 1)
    assert.deepEqual(chart.points[0].missingGames, [])
    assert.deepEqual(chart.points[0].unpublishedGames, ['Game B'])
    assert.deepEqual(new StatsView()._getTooltipConfig(chart.points).callbacks.afterBody([{ dataIndex: 0 }]), [
        'Доход указан у 1 из 1 игр', 'До публикации (не пропуски):', 'Game B',
    ])
    assert.equal(chart.points[1].partial, true)
    assert.equal(chart.points[1].gamesCount, 2)
    assert.deepEqual(chart.points[1].missingGames, ['Game B'])
    assert.equal(prepareChartData(data, day, day, games).points[0].partial, true, 'Unknown publication dates must not hide a failed request')
    const recordedBeforeRelease = [data[0], revenue([[day + 9 * 3600000, 2]])]
    assert.equal(prepareChartData(recordedBeforeRelease, day, day, info).points[0].total, 12, 'Real amounts before publication must not be discarded')
    assert.equal(aggregatePlayersData([players([[day, 8]]), null], day, info), 8)
    const rows = prepareGamesTableData(data, info, day, day, 'day')
    assert.equal(rows[1].beforePublication, true)
    const app = Object.assign(Object.create(App.prototype), {
        rawData: { allGamesData: data, allPlayersData: [players([[day, 8]]), null], gamesInfo: info, lastTimestamp: day },
        activeTab: 'overview', _setupEventHandlers() {},
        view: { element: { querySelector: () => null }, showResults(value) { this.result = value }, setNotice(value) { this.notice = value } },
    })
    app.updateDataForSpecificDate(day)
    assert.equal(app.view.result.partial, false)
    assert.equal(app.view.result.gamesCount, 1)
    assert.doesNotMatch(app.view.notice, /нет значения дохода|Данные игроков доступны не за все/)
})

test('period coverage starts on publication day, preserving actual pre-release amounts and detecting later gaps', () => {
    const info = [{ ...games[0], publishedAt: day + 9 * 3600000 }]
    const data = [revenue([[day - dayMs, null], [day, 5], [day + dayMs, 7]])]
    const counts = [players([[day, 8], [day + dayMs, 4]])]
    const row = prepareGamesTableData(data, info, day - dayMs, day + dayMs, 'week', counts)[0]
    assert.equal(row.totalRevenue, 12)
    assert.equal(row.players, 12)
    const gap = [revenue([[day - dayMs, null], [day, null], [day + dayMs, 7]])]
    const partial = prepareGamesTableData(gap, info, day - dayMs, day + dayMs, 'week', counts)[0]
    assert.equal(partial.totalRevenue, 7)
    assert.equal(partial.partial, true)
    assert.equal(partial.revenuePerPlayer, null)
    assert.equal(prepareGamesTableData(data, info, day - dayMs, day + dayMs, 'week', [players([[day + dayMs, 4]])])[0].players, null)
})

test('a fallback period keeps known money and marks gaps, while exact totals take precedence', () => {
    const start = day
    const end = day + 2 * dayMs
    const raw = { lastTimestamp: end, loadedAt: end, dateRange: ['2026-09-30', '2026-10-02'],
        gamesInfo: [games[0]], allPlayersData: [null], periodErrors: { 'all-time': '503' } }
    const app = Object.create(App.prototype)
    const overview = points => {
        raw.allGamesData = [revenue(points)]
        return app.aggregateDataForPeriod(raw, 'all-time')
    }
    for (const middle of [[], [[day + dayMs, null]]]) {
        const result = overview([[start, 10], ...middle, [end + 9 * 3600000, 20]])
        assert.equal(result.amount, 30)
        assert.equal(result.partial, true)
    }
    assert.equal(overview([[start, 10], [day + dayMs, 0], [end, 20]]).partial, false)
    assert.equal(overview([[day + dayMs, 0], [end, 0]]).partial, true, 'Missing first day counts')
    raw.gamesInfo = [{ ...games[0], publishedAt: day + dayMs }]
    const sinceRelease = overview([[day + dayMs, 0], [end, 0]])
    assert.equal(sinceRelease.amount, 0)
    assert.equal(sinceRelease.partial, false)
    raw.periodRevenues = { 'all-time': { 101: { totalRevenue: 35, advertising: 35, inApp: 0 } } }
    const exact = overview([[end, 20]])
    assert.equal(exact.amount, 35)
    assert.equal(exact.partial, false)
})

test('player-day periods with missing days remain unknown and complete periods include 09:00 points', () => {
    const income = revenue([[day, 1], [day + dayMs, 2], [day + 2 * dayMs, 3]])
    const sparsePlayers = players([[day, 8], [day + 2 * dayMs, 4]])
    assert.equal(prepareGamesTableData([income], games, day, day + 2 * dayMs, 'week', [sparsePlayers])[0].players, null)
    const complete = players([[day + 9 * 3600000, 8], [day + dayMs + 9 * 3600000, 0], [day + 2 * dayMs + 9 * 3600000, 4]])
    assert.equal(prepareGamesTableData([income], games, day, day + 2 * dayMs, 'week', [complete])[0].players, 12)
})

test('income per thousand players renders the unrounded ratio and leaves a zero denominator unknown', () => {
    const originalDocument = globalThis.document
    globalThis.document = { createElement: () => ({
        children: [], attributes: {}, textContent: '',
        appendChild(child) { this.children.push(child) },
        setAttribute(name, value) { this.attributes[name] = value },
    }) }
    try {
        const view = new StatsView()
        const makeRow = (amount, count) => prepareGamesTableData([revenue([[day, amount]])], games, day, day, 'day', [players([[day, count]])])[0]
        const row = makeRow(10.25, 8)
        assert.equal(view._createTableRow(row, 'day').children.at(-1).textContent, formatMoney(1281.25))
        assert.match(view._createTableHeader('week').children[0].children.at(-1).textContent, /Доход на 1 000 игроков/)
        assert.match(view._createTableHeader('week').children[0].children.at(-2).textContent, /Игроки, сумма по дням/)
        assert.equal(view._createTableRow(makeRow(10.25, 0), 'day').children.at(-1).textContent, '—')
        assert.equal(view._createTableRow(makeRow(0, 8), 'day').children.at(-1).textContent, formatMoney(0))
        assert.equal(view._createTableRow({...row, revenuePerPlayer: null}, 'day').children.at(-1).textContent, '—')
    } finally {
        if (originalDocument === undefined) delete globalThis.document
        else globalThis.document = originalDocument
    }
})
