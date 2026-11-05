import { formatMoney, formatCompactNumber, hexToRgba } from '../utils/formatters.js'
import { SELECTORS, DATA_ATTRIBUTES, CHART_COLORS } from '../config/constants.js'

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

    showLoadingProgress(current, total) {
        const content = this._getContentAndClear()
        if (!content) return

        const percent = Math.round((current / total) * 100)

        const loadingDiv = document.createElement('div')
        loadingDiv.className = 'stats-loading'

        loadingDiv.appendChild(this._createDiv('stats-loading-text', 'Загружаем данные...'))
        loadingDiv.appendChild(this._createDiv('stats-loading-counter', `${current} из ${total} игр`))

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

    showCachedActions(onShow, onRefresh) {
        const content = this._getContentAndClear()
        if (!content) return
        const center = this._createDiv('stats-center')
        const show = this._actionButton('Показать', 'show')
        show.onclick = onShow
        const refresh = this._actionButton('Обновить', 'refresh')
        refresh.onclick = onRefresh
        center.append(show, refresh)
        content.appendChild(center)
    }

    showResults(data, selectedPeriod = 'day', availableDates = [], selectedDate = null) {
        this._showDateElement()
        const content = this._getContentAndClear()
        if (!content) return

        content.appendChild(this._createTabSwitcher('overview'))
        content.appendChild(this._createSelectorsWrapper(availableDates, selectedDate, selectedPeriod))

        content.appendChild(this._createStatsRow('stats-row--total', [
            { label: data.partial ? 'Заработок по доступным данным' : 'Общий заработок', value: formatMoney(data.amount), size: 'large' },
        ]))

        content.appendChild(this._createStatsRow('stats-row--sources', [
            { label: 'Реклама', value: formatMoney(data.advertising), size: 'medium' },
            { label: 'In-app', value: formatMoney(data.inApp), size: 'medium' },
        ]))

        content.appendChild(this._createStatsRow('stats-row--players', [
            { label: selectedPeriod === 'day' ? 'Игроков' : 'Игроки, сумма по дням', value: data.players === null ? '—' : (data.players || 0).toLocaleString('ru-RU'), size: 'medium' },
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

    showGamesTable(gamesData, selectedPeriod = 'day', activeTab = 'games-table', availableDates = [], selectedDate = null) {
        this._showDateElement()
        const content = this._getContentAndClear()
        if (!content) return

        content.appendChild(this._createTabSwitcher(activeTab))
        content.appendChild(this._createSelectorsWrapper(availableDates, selectedDate, selectedPeriod))
        content.appendChild(this._createGamesTable(gamesData, selectedPeriod))
    }

    showChart(chartData, selectedPeriod = 'month_current') {
        this._showDateElement()
        const content = this._getContentAndClear()
        if (!content) return

        content.appendChild(this._createTabSwitcher('chart'))
        content.appendChild(this._createPeriodSelector(selectedPeriod))
        content.appendChild(this._createChart(chartData))
    }

    setNotice(message) {
        const notice = this.element?.querySelector('[data-stats="notice"]')
        if (!notice) return
        notice.textContent = message
        notice.hidden = !message
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

    _actionButton(label, action) {
        const paths = {
            show: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
            refresh: 'M20 4v6h-6M20 10a8 8 0 1 0 0 5',
            load: 'M4 4v16h16M8 16v-4m5 4V7m5 9v-6',
        }
        const button = document.createElement('button')
        button.type = 'button'
        button.className = action === 'refresh' ? 'stats-load-button stats-load-button--secondary' : 'stats-load-button'
        button.innerHTML = `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="${paths[action]}"/></svg>`
        button.append(label)
        return button
    }

    _createLoadButtonWrapper() {
        const center = document.createElement('div')
        center.className = 'stats-center'

        const button = this._actionButton('Загрузить статистику', 'load')
        button.setAttribute('data-stats', DATA_ATTRIBUTES.LOAD_BUTTON)

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
        const refresh = this._actionButton('Обновить', 'refresh')
        refresh.dataset.stats = 'refresh'
        refresh.hidden = true
        header.appendChild(refresh)

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
        const notice = this._createDiv('stats-notice')
        notice.setAttribute('data-stats', 'notice')
        notice.setAttribute('role', 'status')
        notice.hidden = true
        container.appendChild(notice)
        container.appendChild(content)

        return container
    }

    _createPeriodSelector(selectedPeriod) {
        const selector = document.createElement('div')
        selector.className = 'stats-period-selector'

        const periods = [
            { key: 'week', label: '7 дней' },
            { key: 'month', label: '30 дней' },
            { key: 'month_current', label: 'Этот месяц' },
            { key: 'month_prev', label: 'Прошлый месяц' },
            { key: 'all-time', label: 'Доступный период' },
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

    _createGamesTable(gamesData, period) {
        const tableWrapper = document.createElement('div')
        tableWrapper.className = 'stats-table-wrapper'

        const table = document.createElement('table')
        table.className = 'stats-table'

        table.appendChild(this._createTableHeader(period))

        const tbody = document.createElement('tbody')
        gamesData.forEach((game) => {
            tbody.appendChild(this._createTableRow(game, period))
        })
        table.appendChild(tbody)

        tableWrapper.appendChild(table)
        tableWrapper.appendChild(this._createDiv('stats-notice',
            'Доход на 1 000 игроков = общий доход ÷ число игроков × 1 000.'
            + (period === 'day' ? '' : ' За период игроки суммируются по дням: один человек может учитываться несколько раз.')
            + ' При отсутствии данных или нуле игроков — прочерк.'))
        return tableWrapper
    }

    _createTableHeader(period) {
        const thead = document.createElement('thead')
        const tr = document.createElement('tr')

        const headers = [
            { sort: 'name', label: 'Название игры' },
            { sort: 'id', label: 'ID игры' },
            { sort: 'totalRevenue', label: 'Общий доход' },
            { sort: 'advertising', label: 'Реклама' },
            { sort: 'inApp', label: 'In-app' },
            { sort: 'players', label: period === 'day' ? 'Игроки' : 'Игроки, сумма по дням' },
            { sort: 'revenuePerPlayer', label: 'Доход на 1 000 игроков' },
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

    _createTableRow(game, period) {
        const row = document.createElement('tr')
        if (game.beforePublication && game.totalRevenue === null) row.setAttribute('title', 'В выбранном периоде игра ещё не опубликована')

        const cells = [
            { className: 'game-name', label: 'Название', value: game.name || 'Неизвестная игра' },
            { className: 'game-id', label: 'ID игры', value: game.id || '-' },
            { className: 'revenue-cell', label: 'Общий доход', value: formatMoney(game.totalRevenue) },
            { className: 'revenue-cell', label: 'Реклама', value: formatMoney(game.advertising) },
            { className: 'revenue-cell', label: 'In-app', value: formatMoney(game.inApp) },
            { className: 'players-cell', label: period === 'day' ? 'Игроки' : 'Игроки, сумма по дням', value: game.players === null ? '—' : (game.players || 0).toLocaleString('ru-RU') },
            { className: 'revenue-cell', label: 'Доход на 1 000 игроков', value: formatMoney(game.revenuePerPlayer === null ? null : game.revenuePerPlayer * 1000) },
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
        if (points.some(point => point.partial && point.total !== null)) {
            container.appendChild(this._createDiv('stats-notice', 'Жёлтые точки и пунктир — дни без значения дохода у части игр, не обязательно сбой. Дни до известной даты публикации не считаются пропусками.'))
        }

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
                        this._createDatasetConfig('Всего', points.map(p => p.total), CHART_COLORS.total, gradients.total, { borderWidth: 3, hidden: false }, points),
                        this._createDatasetConfig('Реклама', points.map(p => p.advertising), CHART_COLORS.advertising, gradients.advertising, { hidden: true }, points),
                        this._createDatasetConfig('In-app', points.map(p => p.inApp), CHART_COLORS.inApp, gradients.inApp, { hidden: true }, points),
                    ],
                },
                options: this._getChartOptions(points),
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
            advertising: createGradient(CHART_COLORS.advertising),
            inApp: createGradient(CHART_COLORS.inApp),
        }
    }

    _createDatasetConfig(label, data, color, gradient, options = {}, points = []) {
        const hoverColor = hexToRgba(color, color === CHART_COLORS.total ? 0.8 : 0.5)
        const pointColors = data.map((_, index) => points[index]?.partial ? '#FBBF24' : color)

        return {
            label,
            data,
            borderColor: color,
            backgroundColor: gradient,
            borderWidth: options.borderWidth || 2,
            fill: true,
            tension: 0.4,
            spanGaps: false,
            segment: {
                borderDash: context => points[context.p0DataIndex]?.partial || points[context.p1DataIndex]?.partial ? [6, 4] : [],
            },
            pointRadius: data.map((_, index) => points[index]?.partial || data.length === 1 ? 4 : 0),
            pointBackgroundColor: pointColors,
            pointBorderColor: pointColors,
            pointHoverRadius: options.borderWidth === 3 ? 6 : 5,
            pointHoverBackgroundColor: pointColors,
            pointHoverBorderColor: hoverColor,
            pointHoverBorderWidth: 2,
            hidden: options.hidden ?? false,
        }
    }

    _getChartOptions(points) {
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
                tooltip: this._getTooltipConfig(points),
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
                generateLabels: chart => Chart.defaults.plugins.legend.labels.generateLabels(chart).map(item => ({
                    ...item,
                    fillStyle: chart.data.datasets[item.datasetIndex].borderColor,
                    strokeStyle: chart.data.datasets[item.datasetIndex].borderColor,
                })),
            },
            onClick: (e, legendItem, legend) => {
                const chart = legend.chart
                const clickedIndex = legendItem.datasetIndex
                const datasets = chart.data.datasets

                if (clickedIndex === 0) {
                    // Clicking "Total" shows only the total and hides the other datasets.
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

    _getTooltipConfig(points = []) {
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
                afterBody: (items) => {
                    const point = points[items[0]?.dataIndex]
                    if (!point || (!point.partial && !point.unpublishedGames?.length)) return []
                    const missing = point.missingGames
                    const lines = [
                        `Доход указан у ${point.gamesCount - missing.length} из ${point.gamesCount} игр`,
                    ]
                    if (missing.length) lines.push(
                        'Без значения дохода:',
                        ...missing.slice(0, 3).map(name => name.length > 48 ? `${name.slice(0, 47)}…` : name),
                        ...(missing.length > 3 ? [`И ещё ${missing.length - 3}`] : []),
                        'Причина отсутствия значения не указана.',
                    )
                    const unpublished = point.unpublishedGames || []
                    if (unpublished.length) lines.push(
                        'До публикации (не пропуски):',
                        ...unpublished.slice(0, 3).map(name => name.length > 48 ? `${name.slice(0, 47)}…` : name),
                        ...(unpublished.length > 3 ? [`И ещё ${unpublished.length - 3}`] : []),
                    )
                    return lines
                },
                labelTextColor: () => 'rgba(248, 250, 252, 0.9)',
            },
        }
    }
}
