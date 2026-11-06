import { Logger } from './logger.service.js'

const CACHE_PREFIX = 'ys_console_stats_v1:'
const CACHE_TTL = 10 * 60 * 1000

function storageCall(storage, method, value) {
    return new Promise((resolve, reject) => {
        const pending = storage[method](value, result => {
            const error = globalThis.chrome?.runtime?.lastError
            if (error) reject(new Error(error.message))
            else resolve(result)
        })
        pending?.then(resolve, reject)
    })
}

function isSnapshot(data) {
    if (!data || !Number.isFinite(data.loadedAt) || !Array.isArray(data.gamesInfo) || !data.gamesInfo.length) return false
    if (data.lastTimestamp !== null && !Number.isFinite(data.lastTimestamp)) return false
    if (!Array.isArray(data.dateRange) || data.dateRange.length !== 2 || !data.dateRange.every(date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)))) return false
    const analytics = value => value === null || (Array.isArray(value?.options?.series) && value.options.series.every(series => typeof series?.id === 'string' && Array.isArray(series.data) && series.data.every(point => Number.isFinite(point?.x) && (point.y === null || Number.isFinite(point.y)))))
    if (![data.allGamesData, data.allPlayersData].every(values => Array.isArray(values) && values.length === data.gamesInfo.length && values.every(analytics))) return false
    if (!data.gamesInfo.every(game => Number.isSafeInteger(Number(game.id)) && Number(game.id) > 0 && typeof game.name === 'string')) return false
    if (!Array.isArray(data.errors) || !data.errors.every(error => typeof error === 'string')) return false
    if (![data.periodRevenues, data.periodErrors].every(value => value && typeof value === 'object' && !Array.isArray(value)) || !Object.values(data.periodErrors).every(error => typeof error === 'string')) return false
    return Object.values(data.periodRevenues).every(period => period && typeof period === 'object' && Object.values(period).every(row => row
        && ['totalRevenue', 'advertising', 'inApp'].every(key => row[key] === null || Number.isFinite(row[key]))))
}

export class StatsCache {
    async read(context) {
        const storage = globalThis.chrome?.storage?.local
        if (!context || context === '-1' || !storage) return null
        const key = CACHE_PREFIX + context
        try {
            const value = (await storageCall(storage, 'get', key))[key]
            if (!value) return null
            const age = Date.now() - value.updatedAt
            const sameDay = new Date(value.data?.loadedAt || 0).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)
            if (!Number.isFinite(value.updatedAt) || age < 0 || age >= CACHE_TTL || !sameDay || value.context !== context || !isSnapshot(value.data)) {
                return null
            }
            const nextReportDay = new Date(value.data.loadedAt)
            nextReportDay.setUTCHours(24, 0, 0, 0)
            return { ...value, expiresAt: Math.min(value.updatedAt + CACHE_TTL, nextReportDay.getTime()) }
        } catch (error) {
            Logger.warn('Statistics cache read failed:', error.message)
            return null
        }
    }

    async write(context, data, updatedAt) {
        const storage = globalThis.chrome?.storage?.local
        if (!context || context === '-1' || !storage || !isSnapshot(data)) return
        await this.removeExpired(storage, context)
        try {
            await storageCall(storage, 'set', { [CACHE_PREFIX + context]: { context, updatedAt, data } })
        } catch (error) {
            // Storage restrictions or quota exhaustion must not prevent showing fresh statistics.
            Logger.warn('Statistics cache write failed:', error.message)
        }
    }

    // Snapshots take megabytes; expired ones of other accounts would otherwise exhaust the quota.
    async removeExpired(storage, context) {
        try {
            const items = await storageCall(storage, 'get', null) || {}
            const isFresh = value => Date.now() - value?.updatedAt >= 0 && Date.now() - value.updatedAt < CACHE_TTL
            const expired = Object.keys(items)
                .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_PREFIX + context && !isFresh(items[key]))
            if (expired.length) await storageCall(storage, 'remove', expired)
        } catch (error) {
            Logger.warn('Statistics cache cleanup failed:', error.message)
        }
    }

    async clear(context) {
        const storage = globalThis.chrome?.storage?.local
        if (!context || context === '-1' || !storage) return
        try { await storageCall(storage, 'remove', CACHE_PREFIX + context) }
        catch (error) { Logger.warn('Statistics cache removal failed:', error.message) }
    }
}
