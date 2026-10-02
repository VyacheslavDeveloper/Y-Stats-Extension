export const SELECTORS = {
    MAIN_CONTAINER: 'main.main',
    APPS_HEADER: '.apps-header',
    PAGE_CONTAINER: '.page.page_full-height.page_width_full',
    STATS_BLOCK_ID: 'yandex-stats-extension',
}

export const TIMINGS = {
    INIT_RETRY_INTERVAL: 500,
    MAX_INIT_ATTEMPTS: 10,
    OBSERVER_START_DELAY: 2000,
    PERIODIC_CHECK_INTERVAL: 5000,
}

export const CURRENCY = {
    LOCALE: 'ru-RU',
    CODE: 'RUB',
    FRACTION_DIGITS: 2,
}

export const API = {
    BASE_URL: 'https://games.yandex.ru',
    ENDPOINTS: {
        APPLICATIONS: '/console/api/applications',
        ANALYTICS: '/console/api/metrics-engine/analytics/data',
        REVENUE_TOTALS: '/console/api/metrics-engine/total/data',
        CONSOLE: '/console/applications',
    },
    PARAMS: {
        PAGE_SIZE: 100,
        PAGE_NUMBER: 0,
        FILTER_FIELD_STATUS: 'status:published',
        FILTER_FIELD_HIDE_DRAFTS: 'hide-delete-drafts:true',
        FILTER_MODE: 'and',
        ORDER_BY: 'ru_and_close_overseas_rating:desc',
    },
    HEADERS: {
        ACCEPT: '*/*',
        ACCEPT_LANGUAGE: 'ru,en-US;q=0.9,en;q=0.8,ru-RU;q=0.7',
        CACHE_CONTROL: 'no-cache',
        PRAGMA: 'no-cache',
    },
    REQUEST_DELAY: 500,
}

export const CHART = {
    SLUG: 'purchase_amount',
    PLAYERS_SLUG: 'players',
    PLAYERS_SERIES_ID: 'Всего',
    LANG: 'ru',
    MOBILE_SLICE: '__total__',
    COUNTRY_SLICE: '__total__',
}

export const REVENUE_SERIES_IDS = {
    ADVERTISING: ['Реклама'],
    IN_APP: ['Инап-покупки', 'In-app purchases'],
}

export const PATHS = {
    APPLICATIONS: '/console/applications',
    APPLICATIONS_WITH_SLASH: '/console/applications/',
}

export const MONITORING = {
    URL_CHECK_INTERVAL: 100,
    PERIODIC_CHECK_INTERVAL: 5000,
}

export const VERSION = {
    MANIFEST_URL:
        'https://raw.githubusercontent.com/VyacheslavDeveloper/Y-Stats-Extension/main/manifest.json',
    REPO_URL: 'https://github.com/VyacheslavDeveloper/Y-Stats-Extension',
    CACHE_KEY: 'ys_version_cache',
    CACHE_TTL_MS: 60 * 60 * 1000,
}

export const LOGGER = {
    PREFIX: '[Y-Stats-Extension]',
}

export const DATA_ATTRIBUTES = {
    LOAD_BUTTON: 'load-button',
    DATE: 'date',
    CONTENT: 'content',
    VERSION: 'version',
    PERIOD: 'period',
    TAB: 'tab',
    SORT: 'sort',
    DATE_SELECTOR: 'date-selector',
    LABEL: 'data-label',
}

export const CHART_COLORS = {
    total: '#ffffff',
    advertising: '#22C55E',
    inApp: '#F97316',
}
