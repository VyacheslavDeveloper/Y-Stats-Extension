import { fetchPublicationDates } from './src/services/publication.service.js'

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'getPublicationDates') return
    if (sender.id !== chrome.runtime.id || !sender.url?.startsWith('https://games.yandex.ru/console/')) {
        sendResponse({ error: 'Недопустимый источник запроса' })
        return
    }
    fetchPublicationDates(message.gameIds).then(
        dates => sendResponse({ dates }),
        error => sendResponse({ error: error.name === 'AbortError' ? 'Превышено время ожидания дат публикации' : error.message }),
    )
    return true
})
