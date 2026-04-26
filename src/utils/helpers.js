import { PATHS, REVENUE_SERIES_IDS, TOTAL_SERIES_IDS, PERIODS } from '../config/constants.js'
import { formatShortDate, calculateRevenuePerPlayer } from './formatters.js'

// ==================== Page helpers ====================

export function isApplicationsPage(path = window.location.pathname) {
    return path === PATHS.APPLICATIONS || path === PATHS.APPLICATIONS_WITH_SLASH
}

// ==================== Data iteration helpers ====================

/**
 * Iterates over all data points in chartkit data array
 * @param {Array} chartkitDataArray - Array of chartkit data objects
 * @param {Function} callback - Called for each point: (point, serie, chartkitData) => void
 * @param {Function} [filter] - Optional filter: (point) => boolean
 */
function forEachDataPoint(chartkitDataArray, callback, filter = null) {
    for (const chartkitData of chartkitDataArray) {
        const series = chartkitData?.options?.series
        if (!series) continue

        for (const serie of series) {
            if (!serie.data?.length) continue

            for (const point of serie.data) {
                if (!point?.x) continue
                if (filter && !filter(point)) continue
                callback(point, serie, chartkitData)
            }
        }
    }
}

/**
 * Collects unique timestamps from chartkit data
 * @param {Array} chartkitDataArray
 * @param {Function} [filter] - Optional filter for points
 * @returns {Set<number>}
 */
function collectTimestamps(chartkitDataArray, filter = null) {
    const timestamps = new Set()
    forEachDataPoint(chartkitDataArray, (point) => {
        timestamps.add(point.x)
    }, filter)
    return timestamps
}

// ==================== Timestamp functions ====================

export function findLatestTimestamp(chartkitDataArray) {
    let result = null
    forEachDataPoint(chartkitDataArray, (point) => {
        if (result === null || point.x > result) {
            result = point.x
        }
    })
    return result
}

export function findEarliestTimestamp(chartkitDataArray) {
    let result = null
    forEachDataPoint(chartkitDataArray, (point) => {
        if (result === null || point.x < result) {
            result = point.x
        }
    })
    return result
}

export function extractUniqueTimestamps(chartkitDataArray) {
    const timestamps = collectTimestamps(chartkitDataArray)
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
        if (!TOTAL_SERIES_IDS.includes(serieId)) continue

        const dataPoint = timestamp
            ? serie.data.find((point) => point.x === timestamp)
            : serie.data[serie.data.length - 1]

        if (typeof dataPoint?.y === 'number') {
            return dataPoint.y
        }
    }

    return 0
}

export function aggregatePlayersData(chartkitDataArray, timestamp = null) {
    let total = 0

    for (const chartkitData of chartkitDataArray) {
        const series = chartkitData?.options?.series
        if (!series) continue

        total += extractPlayersFromSeries(series, timestamp)
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

        if (typeof dataPoint?.y === 'number') {
            total += dataPoint.y
        }
    }

    return total
}

export function aggregateRevenueData(chartkitDataArray, timestamp = null) {
    let yandexAds = 0
    let externalAds = 0
    let inApp = 0

    for (const chartkitData of chartkitDataArray) {
        const series = chartkitData?.options?.series
        if (!series) continue

        yandexAds += extractRevenueFromSeries(series, REVENUE_SERIES_IDS.YANDEX_ADS, timestamp)
        externalAds += extractRevenueFromSeries(series, REVENUE_SERIES_IDS.EXTERNAL_ADS, timestamp)
        inApp += extractRevenueFromSeries(series, REVENUE_SERIES_IDS.IN_APP, timestamp)
    }

    return {
        yandexAds,
        externalAds,
        inApp,
        total: yandexAds + externalAds + inApp,
    }
}

// ==================== Data preparation ====================

export function prepareGamesTableData(allGamesData, gamesInfo, periodStart, periodEnd, period = null, allPlayersData = null) {
    return allGamesData.map((gameData, index) => {
        const gameInfo = gamesInfo[index] || {
            id: 'unknown',
            name: 'Неизвестная игра',
            url: '#',
        }

        const series = gameData?.options?.series
        if (!series) {
            return createEmptyGameData(gameInfo)
        }

        const revenue = period === PERIODS.DAY
            ? extractDayRevenue(series, periodEnd)
            : extractPeriodRevenue(series, periodStart, periodEnd)

        const totalRevenue = revenue.yandexAds + revenue.externalAds + revenue.inApp

        let players = 0
        if (allPlayersData && allPlayersData[index]) {
            const playersSeries = allPlayersData[index]?.options?.series
            if (playersSeries) {
                players = period === PERIODS.DAY
                    ? extractPlayersFromSeries(playersSeries, periodEnd)
                    : extractPeriodPlayers(playersSeries, periodStart, periodEnd)
            }
        }

        const revenuePerPlayer = calculateRevenuePerPlayer(totalRevenue, players)

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

function createEmptyGameData(gameInfo) {
    return {
        id: gameInfo.id,
        name: gameInfo.name,
        url: gameInfo.url,
        totalRevenue: 0,
        yandexAds: 0,
        externalAds: 0,
        inApp: 0,
        players: 0,
        revenuePerPlayer: 0,
    }
}

function extractDayRevenue(series, timestamp) {
    return {
        yandexAds: extractRevenueFromSeries(series, REVENUE_SERIES_IDS.YANDEX_ADS, timestamp),
        externalAds: extractRevenueFromSeries(series, REVENUE_SERIES_IDS.EXTERNAL_ADS, timestamp),
        inApp: extractRevenueFromSeries(series, REVENUE_SERIES_IDS.IN_APP, timestamp),
    }
}

function extractPeriodRevenue(series, periodStart, periodEnd) {
    let yandexAds = 0
    let externalAds = 0
    let inApp = 0

    for (const serie of series) {
        if (!serie.data?.length) continue

        const serieId = serie.id || ''
        const value = sumPointsInPeriod(serie.data, periodStart, periodEnd)

        if (REVENUE_SERIES_IDS.YANDEX_ADS.includes(serieId)) {
            yandexAds += value
        } else if (REVENUE_SERIES_IDS.EXTERNAL_ADS.includes(serieId)) {
            externalAds += value
        } else if (REVENUE_SERIES_IDS.IN_APP.includes(serieId)) {
            inApp += value
        }
    }

    return { yandexAds, externalAds, inApp }
}

function sumPointsInPeriod(data, periodStart, periodEnd) {
    return data
        .filter((point) =>
            point.x >= periodStart &&
            point.x <= periodEnd &&
            typeof point.y === 'number'
        )
        .reduce((sum, point) => sum + point.y, 0)
}

function extractPeriodPlayers(series, periodStart, periodEnd) {
    if (!series || !Array.isArray(series)) {
        return 0
    }

    for (const serie of series) {
        if (!serie.data?.length) continue

        const serieId = serie.id || ''
        if (!TOTAL_SERIES_IDS.includes(serieId)) continue

        return sumPointsInPeriod(serie.data, periodStart, periodEnd)
    }

    return 0
}

export function sortGamesTableData(tableData, sortBy, sortOrder = 'desc') {
    return [...tableData].sort((a, b) => {
        const aValue = a[sortBy]
        const bValue = b[sortBy]

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
            yandexAds: aggregated.yandexAds,
            externalAds: aggregated.externalAds,
            inApp: aggregated.inApp,
            total: aggregated.total,
        }
    })

    return { points }
}
