import { formatMoney, formatCompactNumber, hexToRgba } from '../utils/formatters.js'
import { SELECTORS, DATA_ATTRIBUTES, CHART_COLORS, PERIODS } from '../config/constants.js'

export class StatsView {
    constructor() {
        this.element = null
        this._chartInstance = null
    }

    create() {
        const block = document.createElement('div')
        block.className = 'yandex-stats-block'
        block.id = SELECTORS.STATS_BLOCK_ID
        block.setAttribute('data-extension-block', 'true')

        const container = this._createInitialStructure()
        block.appendChild(container)

        this.element = block
        return block
    }

    isInDOM() {
        return this.element && document.body.contains(this.element)
    }

    destroy() {
        if (this._chartInstance) {
            this._chartInstance.destroy()
            this._chartInstance = null
        }
    }

    // ==================== Public render methods ====================

    showInitialLoading() {
        const content = this._getContentAndClear()
        if (!content) return

        const loadingDiv = document.createElement('div')
        loadingDiv.className = 'stats-loading'

        const spinner = document.createElement('div')
        spinner.className = 'stats-spinner'

        const loadingText = this._createDiv('stats-loading-text', 'Загружаем данные...')

        loadingDiv.appendChild(spinner)
        loadingDiv.appendChild(loadingText)
        content.appendChild(loadingDiv)
    }

    showLoadingProgress(current, total, details = {}) {
        const content = this._getContentAndClear()
        if (!content) return

        const percent = Math.round((current / total) * 100)

        const loadingDiv = document.createElement('div')
        loadingDiv.className = 'stats-loading'

        loadingDiv.appendChild(this._createDiv('stats-loading-text', 'Загружаем данные...'))
        loadingDiv.appendChild(this._createDiv('stats-loading-counter', `${current} из ${total} игр`))

        if (details.gameName) {
            loadingDiv.appendChild(this._createDiv('stats-loading-details', `Игра: ${details.gameName}`))
        }

        const progressBar = document.createElement('div')
        progressBar.className = 'stats-progress-bar'

        const progressFill = document.createElement('div')
        progressFill.className = 'stats-progress-fill'
        progressFill.style.width = `${percent}%`

        progressBar.appendChild(progressFill)
        loadingDiv.appendChild(progressBar)
        loadingDiv.appendChild(this._createDiv('stats-loading-percent', `${percent}%`))

        content.appendChild(loadingDiv)
    }

    showButton() {
        const content = this._getContentAndClear()
        if (!content) return

        content.appendChild(this._createLoadButtonWrapper())
    }

    showResults(data, selectedPeriod = PERIODS.DAY, availableDates = [], selectedDate = null) {
        this._showDateElement()
        const content = this._getContentAndClear()
        if (!content) return

        content.appendChild(this._createTabSwitcher('overview'))
        content.appendChild(this._createSelectorsWrapper(availableDates, selectedDate, selectedPeriod))

        content.appendChild(this._createStatsRow('stats-row--total', [
            { label: 'Общий заработок', value: formatMoney(data.amount), size: 'large' },
        ]))

        content.appendChild(this._createStatsRow('stats-row--sources', [
            { label: 'РСЯ', value: formatMoney(data.yandexAds || 0), size: 'medium' },
            { label: 'Внешние сети', value: formatMoney(data.externalAds || 0), size: 'medium' },
            { label: 'In-app', value: formatMoney(data.inApp || 0), size: 'medium' },
        ]))

        content.appendChild(this._createStatsRow('stats-row--players', [
            { label: 'Игроков', value: (data.players || 0).toLocaleString('ru-RU'), size: 'medium' },
        ]))

        content.appendChild(this._createStatsRow('stats-row--footer', [
            {
                label: 'Количество игр',
                value: `${data.gamesCount} игр`,
                size: 'small',
                additionalClass: 'stats-item--games',
            },
        ]))
    }

    showGamesTable(gamesData, selectedPeriod = PERIODS.DAY, activeTab = 'games-table', availableDates = [], selectedDate = null) {
        this._showDateElement()
        const content = this._getContentAndClear()
        if (!content) return

        content.appendChild(this._createTabSwitcher(activeTab))
        content.appendChild(this._createSelectorsWrapper(availableDates, selectedDate, selectedPeriod))
        content.appendChild(this._createGamesTable(gamesData))
    }

    showChart(chartData, selectedPeriod = PERIODS.MONTH_CURRENT) {
        this._showDateElement()
        const content = this._getContentAndClear()
        if (!content) return

        content.appendChild(this._createTabSwitcher('chart'))
        content.appendChild(this._createPeriodSelector(selectedPeriod))
        content.appendChild(this._createChart(chartData))
    }

    showVersionInfo(info) {
        if (!this.element) return

        const versionBlock = this.element.querySelector(`[data-stats="${DATA_ATTRIBUTES.VERSION}"]`)
        if (!versionBlock) return

        versionBlock.textContent = ''
        versionBlock.style.display = 'none'
        versionBlock.className = 'stats-version'

        if (info?.status !== 'update-available') return

        const current = info?.currentVersion || 'unknown'
        const remote = info?.remoteVersion || 'unknown'
        const url = info?.url || '#'

        const text = document.createElement('span')
        text.className = 'stats-version__text'
        text.textContent = `Доступна новая версия ${remote}. Вы используете ${current}`
        versionBlock.appendChild(text)

        const link = document.createElement('a')
        link.className = 'stats-version__link'
        link.href = url
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        link.textContent = 'Open on GitHub'
        versionBlock.appendChild(link)

        versionBlock.classList.add('stats-version--update')
        versionBlock.style.display = ''
    }

    // ==================== Private helpers ====================

    _getContentAndClear() {
        if (!this.element) return null

        const content = this.element.querySelector(`[data-stats="${DATA_ATTRIBUTES.CONTENT}"]`)
        if (content) {
            content.textContent = ''
        }
        return content
    }

    _showDateElement() {
        if (!this.element) return

        const dateElement = this.element.querySelector(`[data-stats="${DATA_ATTRIBUTES.DATE}"]`)
        if (dateElement) {
            dateElement.style.display = ''
        }
    }

    _createDiv(className, textContent = '') {
        const div = document.createElement('div')
        div.className = className
        if (textContent) {
            div.textContent = textContent
        }
        return div
    }

    _createLoadButtonWrapper() {
        const center = document.createElement('div')
        center.className = 'stats-center'

        const button = document.createElement('button')
        button.className = 'stats-load-button'
        button.setAttribute('data-stats', DATA_ATTRIBUTES.LOAD_BUTTON)
        button.textContent = 'Загрузить статистику'

        center.appendChild(button)
        return center
    }

    _createSelectorsWrapper(availableDates, selectedDate, selectedPeriod) {
        const wrapper = document.createElement('div')
        wrapper.className = 'stats-selectors-wrapper'

        if (availableDates.length > 0) {
            wrapper.appendChild(this._createDateSelector(availableDates, selectedDate))
        }

        wrapper.appendChild(this._createPeriodSelector(selectedPeriod))
        return wrapper
    }

    // ==================== Structure creators ====================

    _createInitialStructure() {
        const container = document.createElement('div')
        container.className = 'stats-container'

        const header = document.createElement('div')
        header.className = 'stats-header'

        const title = document.createElement('h2')
        title.textContent = 'Y-Stats-Extension — Статистика заработка'

        const dateSpan = document.createElement('span')
        dateSpan.className = 'stats-date'
        dateSpan.setAttribute('data-stats', DATA_ATTRIBUTES.DATE)
        dateSpan.style.display = 'none'

        header.appendChild(title)
        header.appendChild(dateSpan)

        const content = document.createElement('div')
        content.className = 'stats-content'
        content.setAttribute('data-stats', DATA_ATTRIBUTES.CONTENT)

        const version = document.createElement('div')
        version.className = 'stats-version'
        version.setAttribute('data-stats', DATA_ATTRIBUTES.VERSION)
        version.style.display = 'none'

        content.appendChild(this._createLoadButtonWrapper())

        container.appendChild(header)
        container.appendChild(version)
        container.appendChild(content)

        return container
    }

    _createPeriodSelector(selectedPeriod) {
        const selector = document.createElement('div')
        selector.className = 'stats-period-selector'

        const periods = [
            { key: PERIODS.WEEK, label: '7 дней' },
            { key: PERIODS.MONTH, label: '30 дней' },
            { key: PERIODS.MONTH_CURRENT, label: 'Этот месяц' },
            { key: PERIODS.MONTH_PREV, label: 'Прошлый месяц' },
            { key: PERIODS.ALL_TIME, label: 'Все время' },
        ]

        periods.forEach(({ key, label }) => {
            const button = document.createElement('button')
            button.className = 'stats-period-btn'
            if (selectedPeriod === key) {
                button.classList.add('active')
            }
            button.setAttribute('data-period', key)
            button.textContent = label
            selector.appendChild(button)
        })

        return selector
    }

    _createDateSelector(availableDates, selectedTimestamp = null) {
        const select = document.createElement('select')
        select.className = 'stats-date-select'
        select.setAttribute('data-date-selector', 'true')

        const defaultOption = document.createElement('option')
        defaultOption.value = ''
        defaultOption.textContent = 'Выбрать конкретный день'
        defaultOption.disabled = true
        defaultOption.selected = selectedTimestamp === null
        select.appendChild(defaultOption)

        availableDates.forEach(({ timestamp, label }) => {
            const option = document.createElement('option')
            option.value = timestamp
            option.textContent = label
            option.selected = selectedTimestamp === timestamp
            select.appendChild(option)
        })

        select.value = selectedTimestamp !== null ? selectedTimestamp : ''
        return select
    }

    _createTabSwitcher(activeTab = 'overview') {
        const tabSwitcher = document.createElement('div')
        tabSwitcher.className = 'stats-tab-switcher'

        const tabs = [
            { key: 'overview', label: 'Общая статистика' },
            { key: 'chart', label: 'График' },
            { key: 'games-table', label: 'Таблица игр' },
        ]

        tabs.forEach(({ key, label }) => {
            const tabButton = document.createElement('button')
            tabButton.className = 'stats-tab-btn'
            if (activeTab === key) {
                tabButton.classList.add('active')
            }
            tabButton.setAttribute('data-tab', key)
            tabButton.textContent = label
            tabSwitcher.appendChild(tabButton)
        })

        return tabSwitcher
    }

    _createStatsRow(rowClass, items) {
        const row = document.createElement('div')
        row.className = `stats-row ${rowClass}`

        items.forEach(({ label, value, size, additionalClass }) => {
            const statsItem = document.createElement('div')
            statsItem.className = 'stats-item'
            if (additionalClass) {
                statsItem.classList.add(additionalClass)
            }

            const labelEl = document.createElement('span')
            labelEl.className = 'stats-label'
            labelEl.textContent = label

            const valueEl = document.createElement('span')
            valueEl.className = `stats-value stats-value--${size}`
            valueEl.textContent = value

            statsItem.appendChild(labelEl)
            statsItem.appendChild(valueEl)
            row.appendChild(statsItem)
        })

        return row
    }

    // ==================== Table ====================

    _createGamesTable(gamesData) {
        const tableWrapper = document.createElement('div')
        tableWrapper.className = 'stats-table-wrapper'

        const table = document.createElement('table')
        table.className = 'stats-table'

        table.appendChild(this._createTableHeader())

        const tbody = document.createElement('tbody')
        gamesData.forEach((game) => {
            tbody.appendChild(this._createTableRow(game))
        })
        table.appendChild(tbody)

        tableWrapper.appendChild(table)
        return tableWrapper
    }

    _createTableHeader() {
        const thead = document.createElement('thead')
        const tr = document.createElement('tr')

        const headers = [
            { sort: 'name', label: 'Название игры' },
            { sort: 'id', label: 'ID игры' },
            { sort: 'totalRevenue', label: 'Общий доход' },
            { sort: 'yandexAds', label: 'РСЯ' },
            { sort: 'externalAds', label: 'Внешние сети' },
            { sort: 'inApp', label: 'In-app' },
            { sort: 'players', label: 'Игроки' },
            { sort: 'revenuePer1000Players', label: '₽ / 1000 игроков' },
        ]

        headers.forEach(({ sort, label }) => {
            const th = document.createElement('th')
            th.className = 'sortable'
            th.setAttribute('data-sort', sort)
            th.textContent = label + ' '

            const arrow = document.createElement('span')
            arrow.className = 'sort-arrow'
            arrow.textContent = '↕'
            th.appendChild(arrow)

            tr.appendChild(th)
        })

        thead.appendChild(tr)
        return thead
    }

    _createTableRow(game) {
        const row = document.createElement('tr')

        const cells = [
            { className: 'game-name', label: 'Название', value: game.name || 'Неизвестная игра' },
            { className: 'game-id', label: 'ID игры', value: game.id || '-' },
            { className: 'revenue-cell', label: 'Общий доход', value: formatMoney(game.totalRevenue) },
            { className: 'revenue-cell', label: 'РСЯ', value: formatMoney(game.yandexAds) },
            { className: 'revenue-cell', label: 'Внешние сети', value: formatMoney(game.externalAds) },
            { className: 'revenue-cell', label: 'In-app', value: formatMoney(game.inApp) },
            { className: 'players-cell', label: 'Игроки', value: (game.players || 0).toLocaleString('ru-RU') },
            { className: 'revenue-cell', label: '₽ / 1000 игроков', value: formatMoney(game.revenuePer1000Players || 0) },
        ]

        cells.forEach(({ className, label, value }) => {
            row.appendChild(this._createTableCell(className, label, value))
        })

        return row
    }

    _createTableCell(className, dataLabel, content) {
        const cell = document.createElement('td')
        cell.className = className
        cell.setAttribute('data-label', dataLabel)
        cell.textContent = content
        return cell
    }

    // ==================== Chart ====================

    _createChart(chartData) {
        const container = document.createElement('div')
        container.className = 'stats-chart-container'

        if (!chartData?.points?.length) {
            const noData = document.createElement('div')
            noData.className = 'stats-chart-no-data'
            noData.textContent = 'Нет данных для отображения'
            container.appendChild(noData)
            return container
        }

        const chartWrapper = document.createElement('div')
        chartWrapper.className = 'stats-chart-wrapper'

        const canvas = document.createElement('canvas')
        canvas.id = 'stats-chart-canvas'
        chartWrapper.appendChild(canvas)
        container.appendChild(chartWrapper)

        if (this._chartInstance) {
            this._chartInstance.destroy()
            this._chartInstance = null
        }

        const { points } = chartData
        const labels = points.map(p => p.dateLabel)

        // Create chart after canvas is in DOM (requestAnimationFrame ensures canvas is rendered)
        requestAnimationFrame(() => {
            if (!document.body.contains(canvas)) return
            const ctx = canvas.getContext('2d')
            const gradients = this._createChartGradients(ctx)

            this._chartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        this._createDatasetConfig('Всего', points.map(p => p.total), CHART_COLORS.total, gradients.total, { borderWidth: 3, hidden: false }),
                        this._createDatasetConfig('РСЯ', points.map(p => p.yandexAds), CHART_COLORS.yandexAds, gradients.yandex, { hidden: true }),
                        this._createDatasetConfig('Внешние сети', points.map(p => p.externalAds), CHART_COLORS.externalAds, gradients.external, { hidden: true }),
                        this._createDatasetConfig('In-app', points.map(p => p.inApp), CHART_COLORS.inApp, gradients.inApp, { hidden: true }),
                    ],
                },
                options: this._getChartOptions(),
            })
        })

        return container
    }

    _createChartGradients(ctx) {
        const createGradient = (color, opacityTop = 0.3, opacityMid = 0.1) => {
            const g = ctx.createLinearGradient(0, 0, 0, 300)
            g.addColorStop(0, hexToRgba(color, opacityTop))
            g.addColorStop(0.5, hexToRgba(color, opacityMid))
            g.addColorStop(1, hexToRgba(color, 0))
            return g
        }

        return {
            total: createGradient(CHART_COLORS.total, 0.25, 0.08),
            yandex: createGradient(CHART_COLORS.yandexAds),
            external: createGradient(CHART_COLORS.externalAds),
            inApp: createGradient(CHART_COLORS.inApp),
        }
    }

    _createDatasetConfig(label, data, color, gradient, options = {}) {
        const hoverColor = hexToRgba(color, color === CHART_COLORS.total ? 0.8 : 0.5)

        return {
            label,
            data,
            borderColor: color,
            backgroundColor: gradient,
            borderWidth: options.borderWidth || 2,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: options.borderWidth === 3 ? 6 : 5,
            pointHoverBackgroundColor: color,
            pointHoverBorderColor: hoverColor,
            pointHoverBorderWidth: 2,
            hidden: options.hidden ?? false,
        }
    }

    _getChartOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            animation: {
                duration: 750,
                easing: 'easeOutQuart',
            },
            plugins: {
                legend: this._getLegendConfig(),
                tooltip: this._getTooltipConfig(),
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.06)', drawBorder: false },
                    border: { display: false },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.5)',
                        font: { size: 11, family: 'system-ui, sans-serif' },
                        padding: 8,
                    },
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.06)', drawBorder: false },
                    border: { display: false },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.5)',
                        font: { size: 11, family: 'system-ui, sans-serif' },
                        padding: 12,
                        callback: (value) => formatCompactNumber(value),
                    },
                },
            },
        }
    }

    _getLegendConfig() {
        return {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
                color: 'rgba(255, 255, 255, 0.8)',
                font: { size: 12, weight: '500', family: 'system-ui, sans-serif' },
                padding: 20,
                usePointStyle: true,
                pointStyle: 'circle',
                boxWidth: 8,
                boxHeight: 8,
            },
            onClick: (e, legendItem, legend) => {
                const chart = legend.chart
                const clickedIndex = legendItem.datasetIndex
                const datasets = chart.data.datasets

                if (clickedIndex === 0) {
                    // Клик на "Всего" — показать только "Всего", скрыть остальные
                    datasets.forEach((_, i) => {
                        chart.getDatasetMeta(i).hidden = (i !== 0)
                    })
                } else {
                    const meta = chart.getDatasetMeta(clickedIndex)
                    const isCurrentlyHidden = meta.hidden

                    if (isCurrentlyHidden) {
                        meta.hidden = false
                        chart.getDatasetMeta(0).hidden = true
                    } else {
                        const visibleOthers = datasets.filter((_, i) =>
                            i !== 0 && !chart.getDatasetMeta(i).hidden
                        ).length

                        if (visibleOthers > 1) {
                            meta.hidden = true
                        } else {
                            meta.hidden = true
                            chart.getDatasetMeta(0).hidden = false
                        }
                    }
                }

                chart.update()
            },
        }
    }

    _getTooltipConfig() {
        return {
            enabled: true,
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleColor: '#F8FAFC',
            titleFont: { size: 13, weight: '600', family: 'system-ui, sans-serif' },
            bodyColor: 'rgba(248, 250, 252, 0.85)',
            bodyFont: { size: 12, weight: '400', family: 'system-ui, sans-serif' },
            borderColor: 'rgba(255, 255, 255, 0.15)',
            borderWidth: 1,
            padding: { top: 12, bottom: 12, left: 16, right: 16 },
            boxPadding: 6,
            usePointStyle: true,
            cornerRadius: 10,
            displayColors: true,
            callbacks: {
                title: (items) => items.length ? `📅 ${items[0].label}` : '',
                label: (context) => ` ${context.dataset.label}: ${formatMoney(context.parsed.y)}`,
                labelTextColor: () => 'rgba(248, 250, 252, 0.9)',
            },
        }
    }
}
