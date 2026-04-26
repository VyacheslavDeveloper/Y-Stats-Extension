import { API, CHART, METRIC_DEFINITIONS } from '../config/constants.js'
import { pickFirstString } from '../utils/helpers.js'
import { Logger } from './logger.service.js'

const CSRF_TOKEN_PATTERN = /"secretkey"\s*:\s*"([^"]+)"/
const FETCH_TIMEOUT = 30000

const ERROR_MESSAGES = {
    HTTP_ERROR: 'HTTP error:',
    TIMEOUT: 'Request timeout exceeded',
    GAMES_LIST_TIMEOUT: 'Request timeout (games list)',
    GAME_TIMEOUT: 'Request timeout (game',
    CSRF_TIMEOUT: 'Request timeout (CSRF token)',
    UNEXPECTED_API: 'Unexpected API response structure:',
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
    static async fetchGamesList() {
        try {
            const params = `page-size=${API.PARAMS.PAGE_SIZE}&page-number=${API.PARAMS.PAGE_NUMBER}&filter-field=${API.PARAMS.FILTER_FIELD_STATUS}&filter-field=${API.PARAMS.FILTER_FIELD_HIDE_DRAFTS}&filter-mode=${API.PARAMS.FILTER_MODE}&order-by=${API.PARAMS.ORDER_BY}`

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
                Logger.error(ERROR_MESSAGES.UNEXPECTED_API, data)
                return []
            }

            const gamesInfo = games
                .map((game) => {
                    const defaultName = `Игра ${game?.rtx_id || 'unknown'}`
                    const localizedTitle = game?.['published-version']?.title || {}
                    const name = pickFirstString(localizedTitle.ru, localizedTitle.en) || defaultName

                    return {
                        id: String(game?.rtx_id || ''),
                        name,
                        url: `${API.BASE_URL}/console/application/${game?.rtx_id}#metrics`,
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
            return []
        }
    }

    static async fetchChartkitData(secretkey, gameId, slug = METRIC_DEFINITIONS.revenue.slug) {
        try {
            const url = `${API.BASE_URL}${API.ENDPOINTS.CHARTKIT}`
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
                }),
                method: 'POST',
                mode: 'cors',
                credentials: 'include',
            })

            if (!response.ok) {
                throw new Error(`${ERROR_MESSAGES.HTTP_ERROR} ${response.status}`)
            }

            const data = await response.json()
            return data
        } catch (error) {
            if (error.name === 'AbortError') {
                Logger.error(`${ERROR_MESSAGES.GAME_TIMEOUT} ${gameId})`)
                throw new Error(ERROR_MESSAGES.TIMEOUT)
            }
            throw error
        }
    }

    static async fetchAndParseCsrfToken() {
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
