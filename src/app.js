import { StatsView } from './views/stats-view.js'
import { ApiService } from './services/api.service.js'
import { DomService } from './services/dom.service.js'
import { VersionService } from './services/version.service.js'
import { Logger } from './services/logger.service.js'
import { TIMINGS, API, DATA_ATTRIBUTES, CHART } from './config/constants.js'
import { formatDate } from './utils/formatters.js'
import { normalizeRequestDelay } from './utils/validators.js'
import {
    isApplicationsPage,
    findLatestTimestamp,
    findEarliestTimestamp,
    aggregateRevenueData,
    aggregatePlayersData,
    prepareGamesTableData,
    sortGamesTableData,
    extractUniqueTimestamps,
    prepareChartData,
} from './utils/helpers.js'

export class App {
    constructor() {
        this.view = new StatsView()
        this.domService = new DomService(this.view)
        this.rawData = null
        this.selectedPeriod = 'month_current'
        this.csrfToken = null
        this.isLoading = false
        this.settings = {
            enabled: true,
            requestDelay: API.REQUEST_DELAY,
            selectedPeriod: 'month_current',
        }
        this.activeTab = 'overview'
        this.sortBy = 'totalRevenue'
        this.sortOrder = 'desc'
        this.selectedDate = null
        this.availableDates = []
        this.dateSelectionMode = 'period'
        this.versionChecked = false
    }

    async init() {
        await this.loadSettings()

        if (!this.settings.enabled) {
            Logger.info('Extension is disabled')
            return
        }

        const token = await ApiService.fetchAndParseCsrfToken()
        if (token) {
            this.csrfToken = token
            Logger.info('CSRF token received')
        } else {
            Logger.warn('Failed to get CSRF token')
        }

        this.domService.startUrlMonitoring((newUrl) => {
            this.handleUrlChange(newUrl)
        })

        this.domService.tryInsert(() => {
            this.onBlockInserted()
        })
    }

    async loadSettings() {
        const defaultSettings = {
            enabled: true,
            requestDelay: API.REQUEST_DELAY,
            selectedPeriod: 'month_current',
        }

        try {
            const storedSettings = await this.getStoredSettings(defaultSettings)
            const { enabled, requestDelay, selectedPeriod } = {
                ...defaultSettings,
                ...storedSettings,
            }

            this.settings = {
                enabled: Boolean(enabled),
                requestDelay: normalizeRequestDelay(requestDelay),
                selectedPeriod: this.normalizePeriod(selectedPeriod),
            }
            
            this.selectedPeriod = this.settings.selectedPeriod
        } catch (error) {
            Logger.error('Settings load failed:', error)
            this.settings = defaultSettings
            this.selectedPeriod = this.normalizePeriod(defaultSettings.selectedPeriod)
        }
    }

    getStoredSettings(defaultSettings) {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
            return Promise.resolve(defaultSettings)
        }

        return new Promise((resolve, reject) => {
            try {
                chrome.storage.sync.get(defaultSettings, (items) => {
                    if (chrome.runtime && chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError)
                        return
                    }

                    resolve(items)
                })
            } catch (error) {
                reject(error)
            }
        })
    }



    handleUrlChange(newUrl) {
        if (isApplicationsPage(newUrl)) {
            if (!this.view.isInDOM()) {
                this.domService.tryInsert(() => {
                    this.onBlockInserted()
                })
            }
        } else {
            this.domService.removeBlock()
        }
    }

    onBlockInserted() {
        if (!this.versionChecked) {
            this.versionChecked = true
            this.renderVersionInfo()
        }

        this.setupLoadButton()

        setTimeout(() => {
            this.domService.startObserver()
            this.domService.startPeriodicCheck()
        }, TIMINGS.OBSERVER_START_DELAY)
    }

    setupLoadButton() {
        const button = document.querySelector(`[data-stats="${DATA_ATTRIBUTES.LOAD_BUTTON}"]`)
        if (button) {
            button.addEventListener('click', () => this.loadData())
        }
    }

    _setupEventHandlers(options = {}) {
        this.setupPeriodButtons()
        this.setupTabSwitcher()
        if (options.withDateSelector !== false) {
            this.setupDateSelector()
        }
        if (options.withTableSorting) {
            this.setupTableSorting()
        }
    }

    _setupDelegatedHandler(selector, handlerKey, handler) {
        const container = document.querySelector(selector)
        if (!container) return

        if (this[handlerKey]) {
            container.removeEventListener('click', this[handlerKey])
        }

        this[handlerKey] = handler
        container.addEventListener('click', handler)
    }

    setupPeriodButtons() {
        this._setupDelegatedHandler('.stats-period-selector', '_periodClickHandler', (e) => {
            const button = e.target.closest('[data-period]')
            if (button) {
                this.selectedPeriod = button.dataset.period
                this.updateDataForPeriod(this.selectedPeriod)
            }
        })
    }

    resetDateSelectorValue() {
        const selector = document.querySelector('[data-date-selector]')
        if (selector) {
            selector.value = ''
            selector.selectedIndex = 0
        }
    }

    setupDateSelector() {
        const selector = document.querySelector('[data-date-selector]')
        if (!selector) return

        if (this._dateChangeHandler) {
            selector.removeEventListener('change', this._dateChangeHandler)
        }

        this._dateChangeHandler = (e) => {
            const selectedValue = e.target.value

            if (selectedValue === '') {
                this.dateSelectionMode = 'period'
                this.selectedDate = null
                this.updateDataForPeriod(this.selectedPeriod)
            } else {
                this.dateSelectionMode = 'specific-date'
                this.selectedDate = parseInt(selectedValue, 10)
                this.updateDataForSpecificDate(this.selectedDate)
            }
        }

        selector.addEventListener('change', this._dateChangeHandler)
    }

    updateDataForPeriod(period) {
        if (!this.rawData) return

        this.selectedPeriod = period
        this.dateSelectionMode = 'period'
        this.selectedDate = null

        if (this.activeTab === 'games-table') {
            this.updateGamesTableForPeriod(period)
        } else if (this.activeTab === 'chart') {
            this.updateChartForPeriod(period)
        } else {
            const aggregatedData = this.aggregateDataForPeriod(this.rawData, period)
            this.view.showResults(aggregatedData, period, this.availableDates, this.selectedDate)
            this._setupEventHandlers()
        }

        this.updateDateDisplay(period)
        this.resetDateSelectorValue()
    }

    updateDataForSpecificDate(timestamp) {
        if (!this.rawData) return

        if (this.activeTab === 'games-table') {
            const tableData = prepareGamesTableData(
                this.rawData.allGamesData,
                this.rawData.gamesInfo,
                timestamp,
                timestamp,
                'day',
                this.rawData.allPlayersData,
            )

            const sortedData = sortGamesTableData(tableData, this.sortBy, this.sortOrder)
            this.view.showGamesTable(
                sortedData,
                'day',
                this.activeTab,
                this.availableDates,
                this.selectedDate,
            )

            this._setupEventHandlers({ withTableSorting: true })
        } else if (this.activeTab === 'chart') {
            this.updateChartForPeriod('day', { start: timestamp, end: timestamp })
        } else {
            const aggregated = aggregateRevenueData(this.rawData.allGamesData, timestamp)
            const players = aggregatePlayersData(this.rawData.allPlayersData, timestamp)

            const dateData = {
                date: new Date(timestamp),
                amount: aggregated.total,
                advertising: aggregated.advertising,
                inApp: aggregated.inApp,
                gamesCount: this.rawData.gamesInfo.length,
                players: players,
            }

            this.view.showResults(dateData, 'day', this.availableDates, this.selectedDate)
            this._setupEventHandlers()
        }

        const dateElement = this.view.element.querySelector(`[data-stats="${DATA_ATTRIBUTES.DATE}"]`)
        if (dateElement) {
            dateElement.textContent = formatDate(new Date(timestamp))
        }
        this.updateNotice({ start: timestamp, end: timestamp })
    }

    updateDateDisplay(period) {
        if (!this.rawData) return

        const dateElement = this.view.element.querySelector(`[data-stats="${DATA_ATTRIBUTES.DATE}"]`)
        if (!dateElement) return

        const range = this.getPeriodRange(this.rawData, period)
        if (!range) return

        const startDate = new Date(range.start)
        const endDate = new Date(range.end)
        dateElement.textContent = `${formatDate(startDate)} — ${formatDate(endDate)}`
        this.updateNotice(range, period)
    }

    updateNotice(range, period = 'day') {
        const messages = []
        const errors = this.rawData.errors || []
        if (errors.length) messages.push(`Данные неполные. Не загружено метрик: ${errors.length}. Итог учитывает только загруженные доходы.`, ...errors)
        if (this.rawData.periodErrors?.[period]) messages.push(`Не удалось получить итог периода: ${this.rawData.periodErrors[period]}. Показана сумма дневных значений графика; возможна разница округления.`)
        const lastTimestamp = this.rawData.lastTimestamp
        if (lastTimestamp) messages.push(`Последний день с данными графиков: ${formatDate(new Date(lastTimestamp))}`)
        if (!lastTimestamp || range.start > lastTimestamp) messages.push('Данные графиков за выбранный период ещё не доступны. Отсутствующие значения показаны прочерком.')
        else if (range.end >= lastTimestamp + 86400000) messages.push('Выбранный период включает дни, за которые графики пока не содержат данных.')
        this.view.setNotice(messages.join('\n'))
    }

    getPeriodRange(rawData, period) {
        if (!rawData) return null

        const lastTimestamp = rawData.lastTimestamp || rawData.loadedAt || Date.now()
        const dayMs = 24 * 60 * 60 * 1000
        const endDate = new Date(rawData.loadedAt || Date.now())

        if (period === 'all-time') {
            const start = rawData.dateRange ? Date.parse(rawData.dateRange[0]) : findEarliestTimestamp(rawData.allGamesData) || lastTimestamp
            return { start, end: lastTimestamp }
        }

        if (period === 'month_current') {
            const start = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1)
            const calendarEnd = Date.UTC(
                endDate.getUTCFullYear(),
                endDate.getUTCMonth() + 1,
                0,
                23,
                59,
                59,
                999,
            )
            const end = Math.min(calendarEnd, rawData.loadedAt || Date.now())
            return { start, end }
        }

        if (period === 'month_prev') {
            const start = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() - 1, 1)
            const end = Date.UTC(
                endDate.getUTCFullYear(),
                endDate.getUTCMonth(),
                0,
                23,
                59,
                59,
                999,
            )
            return { start, end }
        }

        const daysMap = {
            week: 7,
            month: 30,
        }
        const days = daysMap[period] || 7
        const start = lastTimestamp - (days - 1) * dayMs
        return { start, end: lastTimestamp }
    }

    normalizePeriod(period) {
        const map = {
            month_3: 'month_current',
        }
        const allowed = new Set([
            'week',
            'month',
            'month_current',
            'month_prev',
            'all-time',
        ])
        const normalized = map[period] || period
        return allowed.has(normalized) ? normalized : 'month_current'
    }

    aggregateDataForPeriod(rawData, period) {
        if (period === 'day') {
            return rawData.lastDay
        }

        const range = this.getPeriodRange(rawData, period)
        if (!range) return rawData.lastDay

        const { start: periodStart, end: periodEnd } = range

        const rows = prepareGamesTableData(
            rawData.allGamesData, rawData.gamesInfo, periodStart, periodEnd, period, rawData.allPlayersData,
            rawData.periodRevenues?.[period],
        )
        const sum = key => rows.every(row => row[key] === null) ? null : rows.reduce((total, row) => total + (row[key] || 0), 0)
        return {
            date: new Date(periodEnd),
            amount: sum('totalRevenue'),
            advertising: sum('advertising'),
            inApp: sum('inApp'),
            gamesCount: rawData.gamesInfo.length,
            players: rows.some(row => row.players === null) ? null : sum('players'),
        }
    }

    async renderVersionInfo() {
        try {
            const info = await VersionService.checkVersion()
            this.view.showVersionInfo(info)
        } catch (error) {
            Logger.warn('Version info render skipped:', error.message)
        }
    }

    async loadData() {
        if (this.isLoading) {
            Logger.info('Loading is already in progress')
            return
        }

        this.isLoading = true
        const button = document.querySelector(`[data-stats="${DATA_ATTRIBUTES.LOAD_BUTTON}"]`)
        
        if (button) {
            button.disabled = true
            button.style.opacity = '0.5'
            button.style.cursor = 'not-allowed'
        }

        try {
            this.view.setNotice('')
            this.view.showInitialLoading()

            if (!this.csrfToken) {
                Logger.error('CSRF token is missing')
                const token = await ApiService.fetchAndParseCsrfToken()
                if (token) {
                    this.csrfToken = token
                } else {
                    throw new Error('Не удалось получить токен авторизации. Попробуйте перезагрузить страницу.')
                }
            }

            const today = new Date()

            const gamesInfo = await ApiService.fetchGamesList()

            if (!gamesInfo || gamesInfo.length === 0) {
                this.view.showButton()
                this.view.setNotice('Нет опубликованных игр в выбранном аккаунте.')
                this.setupLoadButton()
                return
            }

            const allGamesData = []
            const allPlayersData = []
            const errors = []
            const dateRange = ApiService.getAnalyticsDateRange(today)

            for (let i = 0; i < gamesInfo.length; i++) {
                const gameId = gamesInfo[i].id

                const results = await Promise.allSettled([
                    ApiService.fetchAnalyticsData(this.csrfToken, gameId, CHART.SLUG, dateRange),
                    ApiService.fetchAnalyticsData(this.csrfToken, gameId, CHART.PLAYERS_SLUG, dateRange),
                ])
                for (const [index, result] of results.entries()) {
                    const target = index === 0 ? allGamesData : allPlayersData
                    target.push(result.status === 'fulfilled' ? result.value : null)
                    if (result.status === 'rejected') {
                        errors.push(`${gamesInfo[i].name}: ${index === 0 ? 'доход' : 'игроки'} — ${result.reason.message}`)
                        Logger.error(`Failed to load ${index === 0 ? 'revenue' : 'players'} for game ${gameId}:`, result.reason)
                    }
                }

                this.view.showLoadingProgress(i + 1, gamesInfo.length)

                if (i < gamesInfo.length - 1) {
                    await new Promise((resolve) => setTimeout(resolve, this.settings.requestDelay))
                }
            }

            const lastTimestamp = findLatestTimestamp(allGamesData)

            const aggregated = aggregateRevenueData(allGamesData, lastTimestamp)
            const totalPlayers = aggregatePlayersData(allPlayersData, lastTimestamp)

            const lastDate = lastTimestamp ? new Date(lastTimestamp) : today

            const lastDayData = {
                date: lastDate,
                amount: aggregated.total,
                advertising: aggregated.advertising,
                inApp: aggregated.inApp,
                gamesCount: gamesInfo.length,
                players: totalPlayers,
            }

            this.rawData = {
                allGamesData: allGamesData,
                allPlayersData: allPlayersData,
                gamesInfo: gamesInfo,
                lastDay: lastDayData,
                lastTimestamp: lastTimestamp,
                dateRange,
                loadedAt: today.getTime(),
                errors,
                periodRevenues: {},
                periodErrors: {},
            }

            // Period totals in the console retain precision that rounded daily chart values lose.
            const periods = ['week', 'month', 'month_current', 'month_prev', 'all-time']
            const totals = await Promise.allSettled(periods.map(period => {
                const range = this.getPeriodRange(this.rawData, period)
                return ApiService.fetchRevenueTotals([range.start, range.end].map(value => new Date(value).toISOString().slice(0, 10)))
            }))
            totals.forEach((result, index) => {
                if (result.status === 'fulfilled') this.rawData.periodRevenues[periods[index]] = result.value
                else this.rawData.periodErrors[periods[index]] = result.reason.message
            })

            const timestamps = extractUniqueTimestamps(allGamesData)
            this.availableDates = timestamps.map((timestamp) => ({
                timestamp: timestamp,
                label: formatDate(new Date(timestamp)),
            }))

            if (this.dateSelectionMode === 'specific-date' && this.selectedDate) {
                this.updateDataForSpecificDate(this.selectedDate)
            } else {
                this.updateDataForPeriod(this.selectedPeriod)
            }

        } catch (error) {
            Logger.error('Data load failed:', error)
            this.view.showButton()
            this.view.setNotice(`Не удалось загрузить статистику: ${error.message}`)
            this.setupLoadButton()
        } finally {
            this.isLoading = false
            
            if (button) {
                button.disabled = false
                button.style.opacity = '1'
                button.style.cursor = 'pointer'
            }
        }
    }

    setupTabSwitcher() {
        this._setupDelegatedHandler('.stats-tab-switcher', '_tabClickHandler', (e) => {
            const tab = e.target.closest('[data-tab]')
            if (tab) {
                this.switchTab(tab.dataset.tab)
            }
        })
    }

    switchTab(tabKey) {
        if (!this.rawData) return

        this.activeTab = tabKey

        const tabs = document.querySelectorAll('[data-tab]')
        tabs.forEach((tab) => {
            if (tab.dataset.tab === tabKey) {
                tab.classList.add('active')
            } else {
                tab.classList.remove('active')
            }
        })

        if (this.dateSelectionMode === 'specific-date' && this.selectedDate) {
            this.updateDataForSpecificDate(this.selectedDate)
        } else {
            if (tabKey === 'games-table') {
                this.updateGamesTableForPeriod(this.selectedPeriod)
            } else if (tabKey === 'chart') {
                this.updateChartForPeriod(this.selectedPeriod)
            } else {
                const aggregatedData = this.aggregateDataForPeriod(
                    this.rawData,
                    this.selectedPeriod,
                )
                this.view.showResults(
                    aggregatedData,
                    this.selectedPeriod,
                    this.availableDates,
                    this.selectedDate,
                )
                this._setupEventHandlers()
            }

            this.updateDateDisplay(this.selectedPeriod)
        }
    }

    updateGamesTableForPeriod(period) {
        if (!this.rawData) return

        const range = this.getPeriodRange(this.rawData, period)
        if (!range) return

        const { start: periodStart, end: periodEnd } = range

        const tableData = prepareGamesTableData(
            this.rawData.allGamesData,
            this.rawData.gamesInfo,
            periodStart,
            periodEnd,
            period,
            this.rawData.allPlayersData,
            this.rawData.periodRevenues?.[period],
        )

        const sortedData = sortGamesTableData(tableData, this.sortBy, this.sortOrder)

        this.view.showGamesTable(
            sortedData,
            period,
            this.activeTab,
            this.availableDates,
            this.selectedDate,
        )

        this._setupEventHandlers({ withTableSorting: true })
    }

    updateChartForPeriod(period, range = this.getPeriodRange(this.rawData, period)) {
        if (!this.rawData) return

        if (!range) return

        const { start: periodStart, end: periodEnd } = range

        const chartData = prepareChartData(
            this.rawData.allGamesData,
            periodStart,
            periodEnd,
        )

        this.view.showChart(chartData, period)

        this._setupEventHandlers({ withDateSelector: false })
    }

    setupTableSorting() {
        const headers = document.querySelectorAll('.stats-table th.sortable')
        headers.forEach((header) => {
            header.addEventListener('click', (e) => {
                const sortBy = e.currentTarget.dataset.sort

                if (this.sortBy === sortBy) {
                    this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc'
                } else {
                    this.sortBy = sortBy
                    this.sortOrder = 'desc'
                }

                if (this.dateSelectionMode === 'specific-date' && this.selectedDate) {
                    this.updateDataForSpecificDate(this.selectedDate)
                } else {
                    this.updateGamesTableForPeriod(this.selectedPeriod)
                }
            })
        })

        this.updateSortIndicators()
    }

    updateSortIndicators() {
        const headers = document.querySelectorAll('.stats-table th.sortable')
        headers.forEach((header) => {
            const sortBy = header.dataset.sort
            const arrow = header.querySelector('.sort-arrow')

            if (sortBy === this.sortBy) {
                header.classList.add('sorted')
                arrow.textContent = this.sortOrder === 'asc' ? '↑' : '↓'
            } else {
                header.classList.remove('sorted')
                arrow.textContent = '↕'
            }
        })
    }

    destroy() {
        this.domService.stopObserver()
        this.domService.stopPeriodicCheck()
        this.domService.stopUrlMonitoring()
    }
}
