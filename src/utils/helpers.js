import { PATHS, REVENUE_SERIES_IDS, CHART } from '../config/constants.js'
import { formatShortDate, calculateRevenuePerPlayer } from './formatters.js'

// Compare report calendar days without changing the API's original timestamps.
export const reportDay = timestamp => Math.floor(timestamp / 86400000)

function isBeforePublication(timestamp, publishedAt) {
    return timestamp !== null && Number.isFinite(publishedAt) && reportDay(timestamp) < reportDay(publishedAt)
}

// ==================== Page helpers ====================

export function isApplicationsPage(path = window.location.pathname) {
    return path === PATHS.APPLICATIONS || path === PATHS.APPLICATIONS_WITH_SLASH
}

// ==================== Data iteration helpers ====================

/**
 * Iterates over all data points in analytics data array
 * @param {Array} analyticsDataArray - Array of analytics data objects
 * @param {Function} callback - Called for each point: (point, serie, analyticsData) => void
 * @param {Function} [filter] - Optional filter: (point) => boolean
 */
function forEachDataPoint(analyticsDataArray, callback, filter = null) {
    for (const analyticsData of analyticsDataArray) {
        const series = analyticsData?.options?.series
        if (!series) continue

        for (const serie of series) {
            if (!serie.data?.length) continue

            for (const point of serie.data) {
                if (!Number.isFinite(point?.x) || (point.y !== null && !Number.isFinite(point.y))) continue
                if (filter && !filter(point)) continue
                callback(point, serie, analyticsData)
            }
        }
    }
}

/**
 * Collects unique timestamps from analytics data
 * @param {Array} analyticsDataArray
 * @param {Function} [filter] - Optional filter for points
 * @returns {Set<number>}
 */
function collectTimestamps(analyticsDataArray, filter = null) {
    const timestamps = new Map()
    forEachDataPoint(analyticsDataArray, (point) => {
        if (!timestamps.has(reportDay(point.x))) timestamps.set(reportDay(point.x), point.x)
    }, filter)
    return new Set(timestamps.values())
}

// ==================== Timestamp functions ====================

export function findLatestTimestamp(analyticsDataArray) {
    let result = null
    forEachDataPoint(analyticsDataArray, (point) => {
        if (result === null || point.x > result) {
            result = point.x
        }
    })
    return result
}

export function findEarliestTimestamp(analyticsDataArray) {
    let result = null
    forEachDataPoint(analyticsDataArray, (point) => {
        if (result === null || point.x < result) {
            result = point.x
        }
    })
    return result
}

export function extractUniqueTimestamps(analyticsDataArray) {
    const timestamps = collectTimestamps(analyticsDataArray)
    return Array.from(timestamps).sort((a, b) => b - a)
}

// ==================== Players extraction ====================

export function extractPlayersFromSeries(series, timestamp = null) {
    if (!series || !Array.isArray(series)) {
        return null
    }

    for (const serie of series) {
        if (!serie.data?.length) continue

        const serieId = serie.id || ''
        if (serieId !== CHART.PLAYERS_SERIES_ID) continue

        const dataPoint = timestamp !== null
            ? serie.data.find((point) => reportDay(point.x) === reportDay(timestamp))
            : serie.data[serie.data.length - 1]

        if (dataPoint?.y === null) return null
        if (typeof dataPoint?.y === 'number') {
            return dataPoint.y
        }
    }

    return null
}

export function aggregatePlayersData(analyticsDataArray, timestamp = null, gamesInfo = []) {
    let total = 0
    let loaded = false

    for (const [index, analyticsData] of analyticsDataArray.entries()) {
        const series = analyticsData?.options?.series
        const players = extractPlayersFromSeries(series, timestamp)
        if (players === null) {
            if (isBeforePublication(timestamp, gamesInfo[index]?.publishedAt)) continue
            return null
        }
        loaded = true
        total += players
    }

    return loaded ? total : null
}

// ==================== Revenue extraction ====================

export function extractRevenueFromSeries(series, revenueIds, timestamp = null) {
    let total = 0
    if (!Array.isArray(series) || !series.length) {
        return null
    }

    for (const serie of series) {
        const serieId = serie.id || ''
        if (!revenueIds.includes(serieId)) continue
        if (!serie.data?.length) return null

        const dataPoint = timestamp !== null
            ? serie.data.find((point) => reportDay(point.x) === reportDay(timestamp))
            : serie.data[serie.data.length - 1]

        if (!Number.isFinite(dataPoint?.y)) return null
        total += dataPoint.y
    }

    return total
}

export function aggregateRevenueData(analyticsDataArray, timestamp = null, gamesInfo = []) {
    let advertising = 0
    let inApp = 0
    let loaded = false
    const missingGameIndexes = []
    const unpublishedGameIndexes = []

    for (const [index, analyticsData] of analyticsDataArray.entries()) {
        const series = analyticsData?.options?.series
        const ads = extractRevenueFromSeries(series, REVENUE_SERIES_IDS.ADVERTISING, timestamp)
        const purchases = extractRevenueFromSeries(series, REVENUE_SERIES_IDS.IN_APP, timestamp)
        if (ads === null || purchases === null) {
            if (isBeforePublication(timestamp, gamesInfo[index]?.publishedAt)) unpublishedGameIndexes.push(index)
            else missingGameIndexes.push(index)
            continue
        }
        loaded = true
        advertising += ads
        inApp += purchases
    }

    return {
        advertising: loaded ? advertising : null,
        inApp: loaded ? inApp : null,
        total: loaded ? advertising + inApp : null,
        partial: missingGameIndexes.length > 0,
        missingGameIndexes,
        unpublishedGameIndexes,
        gamesCount: analyticsDataArray.length - unpublishedGameIndexes.length,
    }
}

// ==================== Data preparation ====================

export function prepareGamesTableData(allGamesData, gamesInfo, periodStart, periodEnd, period = null, allPlayersData = null, revenueTotals = null) {
    const lastTimestamp = findLatestTimestamp(allGamesData)
    const lastPlayersTimestamp = findLatestTimestamp(allPlayersData || [])
    return allGamesData.map((gameData, index) => {
        const gameInfo = gamesInfo[index] || {
            id: 'unknown',
            name: 'Неизвестная игра',
            url: '#',
        }

        const series = gameData?.options?.series
        const noData = !series?.length || lastTimestamp === null || reportDay(periodStart) > reportDay(lastTimestamp)
        const revenue = revenueTotals ? revenueTotals[gameInfo.id] || emptyRevenue() : noData ? emptyRevenue() : period === 'day'
            ? extractDayRevenue(series, periodEnd)
            : extractPeriodRevenue(series, periodStart, periodEnd, gameInfo.publishedAt)
        const totalRevenue = revenueTotals ? revenue.totalRevenue : revenue.advertising === null || revenue.inApp === null ? null : revenue.advertising + revenue.inApp

        const playersSeries = allPlayersData?.[index]?.options?.series
        const players = period === 'day'
            ? extractPlayersFromSeries(playersSeries, periodEnd)
            : extractPeriodPlayers(playersSeries, periodStart, Math.min(periodEnd, lastPlayersTimestamp ?? periodEnd), gameInfo.publishedAt)

        const beforePublication = isBeforePublication(periodEnd, gameInfo.publishedAt)
        const partial = revenue.partial === true || (totalRevenue === null && !beforePublication)
        const useMatchedDays = period !== 'day' && (partial || players === null || reportDay(lastPlayersTimestamp) < reportDay(periodEnd))
        const revenuePerPlayer = useMatchedDays
            ? matchedRevenuePerPlayer(series, playersSeries, periodStart, periodEnd)
            : totalRevenue === null ? null : calculateRevenuePerPlayer(totalRevenue, players)

        return {
            id: gameInfo.id,
            name: gameInfo.name,
            url: gameInfo.url,
            totalRevenue,
            players,
            revenuePerPlayer,
            partialRatio: useMatchedDays && revenuePerPlayer !== null,
            beforePublication,
            ...revenue,
            partial,
        }
    })
}

function emptyRevenue() {
    return {
        totalRevenue: null,
        advertising: null,
        inApp: null,
    }
}

function extractDayRevenue(series, timestamp) {
    return {
        advertising: extractRevenueFromSeries(series, REVENUE_SERIES_IDS.ADVERTISING, timestamp),
        inApp: extractRevenueFromSeries(series, REVENUE_SERIES_IDS.IN_APP, timestamp),
    }
}

function matchedRevenuePerPlayer(series, playersSeries, start, end) {
    const counts = playersSeries?.find(item => item.id === CHART.PLAYERS_SERIES_ID)?.data
    if (!series?.length || !counts?.length) return null
    let amount = 0
    let players = 0
    for (const { x, y } of counts) {
        if (!Number.isFinite(y) || reportDay(x) < reportDay(start) || reportDay(x) > reportDay(end)) continue
        const { advertising, inApp } = extractDayRevenue(series, x)
        if (advertising === null || inApp === null) continue
        amount += advertising + inApp
        players += y
    }
    return calculateRevenuePerPlayer(amount, players)
}

function extractPeriodRevenue(series, periodStart, periodEnd, publishedAt) {
    let advertising = 0
    let inApp = 0
    let loaded = false
    let partial = false
    for (let day = reportDay(periodStart); day <= reportDay(periodEnd); day++) {
        const timestamp = day * 86400000
        const amounts = extractDayRevenue(series, timestamp)
        if (amounts.advertising === null || amounts.inApp === null) {
            if (!isBeforePublication(timestamp, publishedAt)) partial = true
            continue
        }
        loaded = true
        advertising += amounts.advertising
        inApp += amounts.inApp
    }
    return { advertising: loaded ? advertising : null, inApp: loaded ? inApp : null, partial }
}

function sumPointsInPeriod(data, periodStart, periodEnd, publishedAt) {
    const points = data.filter(point => reportDay(point.x) >= reportDay(periodStart) && reportDay(point.x) <= reportDay(periodEnd))
    return !points.some(point => Number.isFinite(point.y)) || points.some(point => point.y === null && !isBeforePublication(point.x, publishedAt))
        ? null : points.reduce((sum, point) => sum + (point.y ?? 0), 0)
}

function extractPeriodPlayers(series, periodStart, periodEnd, publishedAt) {
    if (!series || !Array.isArray(series)) {
        return null
    }

    for (const serie of series) {
        if (!serie.data?.length) continue

        const serieId = serie.id || ''
        if (serieId !== CHART.PLAYERS_SERIES_ID) continue

        const firstRequiredDay = Math.max(reportDay(periodStart), Number.isFinite(publishedAt) ? reportDay(publishedAt) : reportDay(periodStart))
        const days = new Set(serie.data.filter(point => Number.isFinite(point.y)
            && reportDay(point.x) >= firstRequiredDay && reportDay(point.x) <= reportDay(periodEnd))
            .map(point => reportDay(point.x)))
        if (days.size !== Math.max(0, reportDay(periodEnd) - firstRequiredDay + 1)) return null
        return sumPointsInPeriod(serie.data, periodStart, periodEnd, publishedAt)
    }

    return null
}

export function sortGamesTableData(tableData, sortBy, sortOrder = 'desc') {
    return [...tableData].sort((a, b) => {
        const aValue = a[sortBy]
        const bValue = b[sortBy]
        if (aValue === null) return bValue === null ? 0 : 1
        if (bValue === null) return -1

        if (typeof aValue === 'string') {
            return sortOrder === 'asc'
                ? aValue.localeCompare(bValue, 'ru')
                : bValue.localeCompare(aValue, 'ru')
        }

        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue
    })
}

// ==================== Chart data ====================

export function prepareChartData(allGamesData, periodStart, periodEnd, gamesInfo = []) {
    const filter = (point) => reportDay(point.x) >= reportDay(periodStart) && reportDay(point.x) <= reportDay(periodEnd)
    const timestampsSet = collectTimestamps(allGamesData, filter)
    const timestamps = Array.from(timestampsSet).sort((a, b) => a - b)

    const byDay = new Map(timestamps.map(timestamp => [reportDay(timestamp), timestamp]))
    const points = []
    for (let day = reportDay(timestamps[0]); day <= reportDay(timestamps.at(-1)); day++) {
        const timestamp = byDay.get(day) ?? day * 86400000
        const aggregated = aggregateRevenueData(allGamesData, timestamp, gamesInfo)
        points.push({
            timestamp,
            dateLabel: formatShortDate(new Date(timestamp)),
            advertising: aggregated.advertising,
            inApp: aggregated.inApp,
            total: aggregated.total,
            partial: aggregated.partial,
            gamesCount: aggregated.gamesCount,
            missingGames: aggregated.missingGameIndexes.map(index => gamesInfo[index]?.name || 'Неизвестная игра'),
            unpublishedGames: aggregated.unpublishedGameIndexes.map(index => gamesInfo[index]?.name || 'Неизвестная игра'),
        })
    }

    return { points }
}
