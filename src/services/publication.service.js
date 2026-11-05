const CATALOGUE_URL = 'https://yandex.ru/games/api/catalogue/v2/get_games?lang=ru&draft=false'

export function normalizePublicationDates(data, gameIds) {
    if (!Array.isArray(data?.games)) throw new Error('Неизвестный формат дат публикации')
    const dates = Object.fromEntries(gameIds.map(id => [id, null]))
    for (const game of data.games) {
        if (!Object.hasOwn(dates, game?.appID)) continue
        const seconds = game.firstPublished
        if (Number.isSafeInteger(seconds) && seconds > 0 && Number.isFinite(new Date(seconds * 1000).getTime())) {
            dates[game.appID] = seconds * 1000
        }
    }
    return dates
}

export async function fetchPublicationDates(gameIds) {
    if (!Array.isArray(gameIds) || !gameIds.length || gameIds.length > 100
        || gameIds.some(id => !Number.isSafeInteger(id) || id <= 0)) {
        throw new Error('Некорректный список игр для дат публикации')
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    try {
        const response = await fetch(CATALOGUE_URL, {
            method: 'POST',
            credentials: 'omit',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appIDs: gameIds, format: 'long' }),
            signal: controller.signal,
        })
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`)
        return normalizePublicationDates(await response.json(), gameIds)
    } finally {
        clearTimeout(timeout)
    }
}
