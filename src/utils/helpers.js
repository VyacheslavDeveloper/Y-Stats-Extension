import { PATHS, REVENUE_SERIES_IDS, CHART } from '../config/constants.js'
import { formatShortDate, calculateRevenuePerPlayer } from './formatters.js'

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
                if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) continue
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
    const timestamps = new Set()
    forEachDataPoint(analyticsDataArray, (point) => {
        timestamps.add(point.x)
    }, filter)
    return timestamps
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
        return 0
    }

    for (const serie of series) {
        if (!serie.data?.length) continue

        const serieId = serie.id || ''
        if (serieId !== CHART.PLAYERS_SERIES_ID) continue

        const dataPoint = timestamp
            ? serie.data.find((point) => point.x === timestamp)
            : serie.data[serie.data.length - 1]

        if (dataPoint?.y === null) return null
        if (typeof dataPoint?.y === 'number') {
            return dataPoint.y
        }
    }

    return 0
}

export function aggregatePlayersData(analyticsDataArray, timestamp = null) {
    let total = 0

    for (const analyticsData of analyticsDataArray) {
        const series = analyticsData?.options?.series
        if (!series?.length) return null

        const players = extractPlayersFromSeries(series, timestamp)
        if (players === null) return null
        total += players
    }

    return total
}

// ==================== Revenue extraction ====================

export function extractRevenueFromSeries(series, revenueIds, timestamp = null) {
    let total = 0
    if (!series || !Array.isArray(series)) {
        return total
    }

    for (const serie of series) {
        if (!serie.data?.length) continue

        const serieId = serie.id || ''
        if (!revenueIds.includes(serieId)) continue

        const dataPoint = timestamp
            ? serie.data.find((point) => point.x === timestamp)
            : serie.data[serie.data.length - 1]

        if (dataPoint?.y === null) return null
        if (typeof dataPoint?.y === 'number') {
            total += dataPoint.y
        }
    }

    return total
}

export function aggregateRevenueData(analyticsDataArray, timestamp = null) {
    let advertising = 0
    let inApp = 0
    let loaded = false

    for (const analyticsData of analyticsDataArray) {
        const series = analyticsData?.options?.series
        if (!series?.length) continue
        loaded = true

        const ads = extractRevenueFromSeries(series, REVENUE_SERIES_IDS.ADVERTISING, timestamp)
        const purchases = extractRevenueFromSeries(series, REVENUE_SERIES_IDS.IN_APP, timestamp)
        if (ads === null || purchases === null) return { advertising: null, inApp: null, total: null }
        advertising += ads
        inApp += purchases
    }

    return loaded ? {
        advertising,
        inApp,
        total: advertising + inApp,
    } : { advertising: null, inApp: null, total: null }
}

// ==================== Data preparation ====================

export function prepareGamesTableData(allGamesData, gamesInfo, periodStart, periodEnd, period = null, allPlayersData = null, revenueTotals = null) {
    const lastTimestamp = findLatestTimestamp(allGamesData)
    return allGamesData.map((gameData, index) => {
        const gameInfo = gamesInfo[index] || {
            id: 'unknown',
            name: 'Неизвестная игра',
            url: '#',
        }

        const series = gameData?.options?.series
        const noData = !series || periodStart > lastTimestamp
        const revenue = revenueTotals ? revenueTotals[gameInfo.id] || emptyRevenue() : noData ? emptyRevenue() : period === 'day'
            ? extractDayRevenue(series, periodEnd)
            : extractPeriodRevenue(series, periodStart, periodEnd)
        const totalRevenue = revenueTotals ? revenue.totalRevenue : revenue.advertising === null || revenue.inApp === null ? null : revenue.advertising + revenue.inApp

        let players = null
        if (allPlayersData && allPlayersData[index]) {
            const playersSeries = allPlayersData[index]?.options?.series
            if (playersSeries) {
                players = !playersSeries.length || periodStart > findLatestTimestamp([allPlayersData[index]]) ? null : period === 'day'
                    ? extractPlayersFromSeries(playersSeries, periodEnd)
                    : extractPeriodPlayers(playersSeries, periodStart, periodEnd)
            }
        }

        const revenuePerPlayer = players === null || totalRevenue === null ? null : calculateRevenuePerPlayer(totalRevenue, players)

        return {
            id: gameInfo.id,
            name: gameInfo.name,
            url: gameInfo.url,
            totalRevenue,
            players,
            revenuePerPlayer,
            ...revenue,
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

function extractPeriodRevenue(series, periodStart, periodEnd) {
    let advertising = 0
    let inApp = 0

    for (const serie of series) {
        if (!serie.data?.length) continue

        const serieId = serie.id || ''
        const value = sumPointsInPeriod(serie.data, periodStart, periodEnd)
        if (value === null) return { advertising: null, inApp: null }

        if (REVENUE_SERIES_IDS.ADVERTISING.includes(serieId)) {
            advertising += value
        } else if (REVENUE_SERIES_IDS.IN_APP.includes(serieId)) {
            inApp += value
        }
    }

    return { advertising, inApp }
}

function sumPointsInPeriod(data, periodStart, periodEnd) {
    const points = data.filter(point => point.x >= periodStart && point.x <= periodEnd)
    return points.some(point => point.y === null) ? null : points.reduce((sum, point) => sum + point.y, 0)
}

function extractPeriodPlayers(series, periodStart, periodEnd) {
    if (!series || !Array.isArray(series)) {
        return 0
    }

    for (const serie of series) {
        if (!serie.data?.length) continue

        const serieId = serie.id || ''
        if (serieId !== CHART.PLAYERS_SERIES_ID) continue

        return sumPointsInPeriod(serie.data, periodStart, periodEnd)
    }

    return 0
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

export function prepareChartData(allGamesData, periodStart, periodEnd) {
    const filter = (point) => point.x >= periodStart && point.x <= periodEnd
    const timestampsSet = collectTimestamps(allGamesData, filter)
    const timestamps = Array.from(timestampsSet).sort((a, b) => a - b)

    const points = timestamps.map((timestamp) => {
        const aggregated = aggregateRevenueData(allGamesData, timestamp)
        return {
            timestamp,
            dateLabel: formatShortDate(new Date(timestamp)),
            advertising: aggregated.advertising,
            inApp: aggregated.inApp,
            total: aggregated.total,
        }
    })

    return { points }
}
