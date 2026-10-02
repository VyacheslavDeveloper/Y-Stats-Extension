import { API, CHART, REVENUE_SERIES_IDS } from '../config/constants.js'
import { Logger } from './logger.service.js'

const CSRF_TOKEN_PATTERN = /"secretkey"\s*:\s*"([^"]+)"/
const FETCH_TIMEOUT = 30000

export function normalizeAnalyticsData(data, slug) {
    if (!Array.isArray(data?.options?.series)) {
        throw new Error('Неизвестный формат ответа метрик кабинета')
    }
    const expectedIds = slug === CHART.PLAYERS_SLUG
        ? [CHART.PLAYERS_SERIES_ID]
        : [...REVENUE_SERIES_IDS.ADVERTISING, ...REVENUE_SERIES_IDS.IN_APP]
    const ownSeries = data.options.series.filter(series => series.graphType !== 'category')
    const series = ownSeries.filter(series => expectedIds.includes(series.name) || expectedIds.includes(series.id))
    if (ownSeries.length && !series.length) {
        throw new Error(`Неизвестные ряды метрики ${slug}: ${ownSeries.map(series => series.name || series.id).join(', ')}`)
    }
    if (slug === CHART.SLUG && series.length !== ownSeries.length) {
        throw new Error('В ответе появились неизвестные источники дохода')
    }
    const normalized = series.map(series => {
        if (!Array.isArray(series.data)) throw new Error(`Неизвестный формат данных метрики ${slug}`)
        return {
            id: expectedIds.includes(series.name) ? series.name : series.id,
            data: series.data.map(point => {
                const { x, y } = Array.isArray(point) ? { x: point[0], y: point[1] } : point || {}
                if (!Number.isFinite(x) || (y !== null && !Number.isFinite(y))) {
                    throw new Error(`Неизвестный формат точек метрики ${slug}`)
                }
                return { x, y }
            }),
        }
    })
    // Match the console's tooltip total; never silently omit a new revenue source.
    if (slug === CHART.SLUG && data.tooltip_total?.values) {
        for (const [timestamp, total] of Object.entries(data.tooltip_total.values)) {
            if (!Number.isFinite(total)) continue
            const sum = normalized.reduce((sum, series) => sum + (series.data.find(point => point.x === Number(timestamp))?.y || 0), 0)
            if (Math.abs(sum - total) > 0.02) throw new Error('Источники дохода не совпадают с итогом кабинета')
        }
    }
    return { options: { series: normalized } }
}

export function normalizeRevenueTotals(data) {
    if (!Array.isArray(data?.items) || (data.currency && data.currency !== 'RUB')) {
        throw new Error('Неизвестный формат итогов дохода кабинета')
    }
    const number = value => {
        if (value === null || value === undefined || value === '') return null
        const result = Number(value)
        if (!Number.isFinite(result)) throw new Error('Некорректная сумма дохода кабинета')
        return result
    }
    return Object.fromEntries(data.items.map(item => {
        if (!Number.isSafeInteger(Number(item.game_id))) throw new Error('Некорректный ID игры в итогах дохода')
        return [item.game_id, {
            totalRevenue: number(item.earn),
            advertising: number(item.adv),
            inApp: number(item.inapp),
        }]
    }))
}

const ERROR_MESSAGES = {
    HTTP_ERROR: 'HTTP error:',
    TIMEOUT: 'Request timeout exceeded',
    GAMES_LIST_TIMEOUT: 'Request timeout (games list)',
    GAME_TIMEOUT: 'Request timeout (game',
    CSRF_TIMEOUT: 'Request timeout (CSRF token)',
    FETCH_FAILED: 'Failed to fetch games list:',
    CSRF_FAILED: 'Failed to get CSRF token:',
}

function fetchWithTimeout(url, options = {}, timeout = FETCH_TIMEOUT) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    return fetch(url, {
        ...options,
        signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId))
}

export class ApiService {
    static getRelationContext() {
        const context = Number(new URLSearchParams(window.location.hash.slice(1)).get('relation_context'))
        // The console briefly puts -1 in the URL while resolving the active account.
        return Number.isSafeInteger(context) && context > 0 ? String(context) : null
    }

    static async fetchRevenueTotals(dateRange) {
        const params = new URLSearchParams({ lang: CHART.LANG, slug: 'total_earn' })
        dateRange.forEach(date => params.append('date_range', date))
        const context = this.getRelationContext()
        if (context) params.set('relation_context', context)
        const response = await fetchWithTimeout(`${API.BASE_URL}${API.ENDPOINTS.REVENUE_TOTALS}?${params}`, {
            credentials: 'include',
            headers: { accept: API.HEADERS.ACCEPT },
        })
        if (!response.ok) throw new Error(`${ERROR_MESSAGES.HTTP_ERROR} ${response.status}`)
        return normalizeRevenueTotals(await response.json())
    }

    static async fetchGamesList() {
        try {
            let params = `page-size=${API.PARAMS.PAGE_SIZE}&page-number=${API.PARAMS.PAGE_NUMBER}&filter-field=${API.PARAMS.FILTER_FIELD_STATUS}&filter-field=${API.PARAMS.FILTER_FIELD_HIDE_DRAFTS}&filter-mode=${API.PARAMS.FILTER_MODE}&order-by=${API.PARAMS.ORDER_BY}`
            const context = this.getRelationContext()
            if (context) params += `&relation_context=${encodeURIComponent(context)}`

            const url = `${API.BASE_URL}${API.ENDPOINTS.APPLICATIONS}?${params}`
            const response = await fetchWithTimeout(url, {
                headers: {
                    accept: API.HEADERS.ACCEPT,
                    'accept-language': API.HEADERS.ACCEPT_LANGUAGE,
                    'cache-control': API.HEADERS.CACHE_CONTROL,
                    pragma: API.HEADERS.PRAGMA,
                },
                method: 'GET',
                mode: 'cors',
                credentials: 'include',
            })

            if (!response.ok) {
                throw new Error(`${ERROR_MESSAGES.HTTP_ERROR} ${response.status}`)
            }

            const data = await response.json()

            let games = []
            if (Array.isArray(data)) {
                games = data
            } else if (data && data.data && Array.isArray(data.data)) {
                games = data.data
            } else if (data && data.applications && Array.isArray(data.applications)) {
                games = data.applications
            } else {
                throw new Error('Неизвестный формат списка игр')
            }

            const gamesInfo = games
                .map((game) => {
                    let name = `Игра ${game.rtx_id}`
                    if (game['published-version']?.title) {
                        name = game['published-version'].title.ru || game['published-version'].title.en || name
                    }

                    const gameUrl = `https://games.yandex.ru/console/application/${game.rtx_id}#metrics`

                    return {
                        id: game.rtx_id,
                        name: name,
                        url: gameUrl,
                    }
                })
                .filter((game) => game.id)

            return gamesInfo
        } catch (error) {
            if (error.name === 'AbortError') {
                Logger.error(ERROR_MESSAGES.GAMES_LIST_TIMEOUT)
                throw new Error(ERROR_MESSAGES.TIMEOUT)
            }
            Logger.error(ERROR_MESSAGES.FETCH_FAILED, error)
            throw error
        }
    }

    // The console permits up to 13 calendar months, ending on today's UTC date.
    static getAnalyticsDateRange(today = new Date()) {
        const end = new Date(today.toISOString().slice(0, 10))
        const start = new Date(end)
        const day = start.getUTCDate()
        start.setUTCDate(1)
        start.setUTCMonth(start.getUTCMonth() - 13)
        const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate()
        start.setUTCDate(Math.min(day, lastDay))
        return [start, end].map(date => date.toISOString().slice(0, 10))
    }

    static async fetchAnalyticsData(secretkey, gameId, slug = CHART.SLUG, dateRange = this.getAnalyticsDateRange()) {
        try {
            const url = `${API.BASE_URL}${API.ENDPOINTS.ANALYTICS}`
            const response = await fetchWithTimeout(url, {
                headers: {
                    accept: API.HEADERS.ACCEPT,
                    'accept-language': API.HEADERS.ACCEPT_LANGUAGE,
                    'cache-control': API.HEADERS.CACHE_CONTROL,
                    'content-type': 'application/json',
                    pragma: API.HEADERS.PRAGMA,
                    'x-csrf-token': secretkey,
                },
                body: JSON.stringify({
                    slug: slug,
                    game_id: gameId,
                    lang: CHART.LANG,
                    mobile_slice: CHART.MOBILE_SLICE,
                    country_slice: CHART.COUNTRY_SLICE,
                    date_range: dateRange,
                }),
                method: 'POST',
                mode: 'cors',
                credentials: 'include',
            })

            if (!response.ok) {
                throw new Error(`${ERROR_MESSAGES.HTTP_ERROR} ${response.status}`)
            }

            const data = await response.json()
            return normalizeAnalyticsData(data, slug)
        } catch (error) {
            if (error.name === 'AbortError') {
                Logger.error(`${ERROR_MESSAGES.GAME_TIMEOUT} ${gameId})`)
                throw new Error(ERROR_MESSAGES.TIMEOUT)
            }
            throw error
        }
    }

    static async fetchAndParseCsrfToken() {
        const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content')
        if (token) return token
        try {
            const url = `${API.BASE_URL}${API.ENDPOINTS.CONSOLE}`
            const response = await fetchWithTimeout(url, {
                headers: {
                    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'accept-language': API.HEADERS.ACCEPT_LANGUAGE,
                },
                method: 'GET',
                mode: 'cors',
                credentials: 'include',
            })

            if (!response.ok) {
                throw new Error(`${ERROR_MESSAGES.HTTP_ERROR} ${response.status}`)
            }

            const html = await response.text()
            const match = html.match(CSRF_TOKEN_PATTERN)

            if (match && match[1]) {
                return match[1]
            }

            return null
        } catch (error) {
            if (error.name === 'AbortError') {
                Logger.error(ERROR_MESSAGES.CSRF_TIMEOUT)
            } else {
                Logger.error(ERROR_MESSAGES.CSRF_FAILED, error)
            }
            return null
        }
    }
}
