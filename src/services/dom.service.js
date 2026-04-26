import { SELECTORS, TIMINGS, MONITORING } from '../config/constants.js'
import { isApplicationsPage } from '../utils/helpers.js'

export class DomService {
    constructor(view) {
        this.view = view
        this.observer = null
        this.initAttempts = 0
        this.urlCheckInterval = null
        this.periodicCheckInterval = null
        this.currentUrl = window.location.pathname
        this.popstateHandler = null
        this.linkClickHandler = null
        this.onPageChange = null
        this.onBlockInserted = null
    }

    setInsertCallback(callback) {
        this.onBlockInserted = callback
    }

    insert() {
        if (!isApplicationsPage()) {
            return false
        }

        const mainElement = document.querySelector(SELECTORS.MAIN_CONTAINER)

        if (!mainElement) {
            return false
        }

        const existingBlock = document.getElementById(SELECTORS.STATS_BLOCK_ID)
        if (existingBlock) {
            return true
        }

        const appsHeader = mainElement.querySelector(SELECTORS.APPS_HEADER)
        const page = mainElement.querySelector(SELECTORS.PAGE_CONTAINER)

        if (!appsHeader || !page) {
            return false
        }

        const statsBlock = this.view.create()
        mainElement.insertBefore(statsBlock, page)

        if (typeof this.onBlockInserted === 'function') {
            this.onBlockInserted()
        }

        return true
    }

    tryInsert() {
        this.initAttempts++
        const success = this.insert()

        if (!success && this.initAttempts < TIMINGS.MAX_INIT_ATTEMPTS) {
            setTimeout(() => this.tryInsert(), TIMINGS.INIT_RETRY_INTERVAL)
        }
    }

    startObserver() {
        if (this.observer) {
            return
        }

        this.observer = new MutationObserver(() => {
            if (isApplicationsPage() && !this.view.isInDOM()) {
                this.insert()
            } else if (!isApplicationsPage() && this.view.isInDOM()) {
                this.removeBlock()
            }
        })

        const mainElement = document.querySelector(SELECTORS.MAIN_CONTAINER)
        if (mainElement) {
            this.observer.observe(mainElement, {
                childList: true,
                subtree: true,
            })
        }
    }

    startPeriodicCheck() {
        if (this.periodicCheckInterval) {
            return
        }

        this.periodicCheckInterval = setInterval(() => {
            if (isApplicationsPage() && !this.view.isInDOM()) {
                this.insert()
            } else if (!isApplicationsPage() && this.view.isInDOM()) {
                this.removeBlock()
            }
        }, MONITORING.PERIODIC_CHECK_INTERVAL)
    }

    startUrlMonitoring(onPageChange) {
        if (this.urlCheckInterval) {
            this.onPageChange = onPageChange
            return
        }

        this.onPageChange = onPageChange

        this.urlCheckInterval = setInterval(() => {
            const newUrl = window.location.pathname

            if (newUrl !== this.currentUrl) {
                this.currentUrl = newUrl

                if (this.onPageChange) {
                    this.onPageChange(newUrl)
                }
            }
        }, MONITORING.URL_CHECK_INTERVAL)

        const popstateHandler = () => {
            const newUrl = window.location.pathname
            if (newUrl !== this.currentUrl) {
                this.currentUrl = newUrl
                if (this.onPageChange) {
                    this.onPageChange(newUrl)
                }
            }
        }
        window.addEventListener('popstate', popstateHandler)
        this.popstateHandler = popstateHandler

        if (!window.__yandexStatsHistoryPatched) {
            const originalPushState = history.pushState
            const originalReplaceState = history.replaceState
            const self = this

            history.pushState = function (...args) {
                originalPushState.apply(this, args)
                setTimeout(() => {
                    const newUrl = window.location.pathname
                    if (self.onPageChange) {
                        self.onPageChange(newUrl)
                    }
                }, 0)
            }

            history.replaceState = function (...args) {
                originalReplaceState.apply(this, args)
                setTimeout(() => {
                    const newUrl = window.location.pathname
                    if (self.onPageChange) {
                        self.onPageChange(newUrl)
                    }
                }, 0)
            }

            window.__yandexStatsHistoryPatched = true
        }

        this.linkClickHandler = (e) => {
            const target = e.target.closest('a')
            if (!target?.href) {
                return
            }

            const url = new URL(target.href)
            if (url.hostname !== window.location.hostname) {
                return
            }

            if (!isApplicationsPage(url.pathname) && this.view.isInDOM()) {
                const block = document.getElementById(SELECTORS.STATS_BLOCK_ID)
                if (block) {
                    block.style.opacity = '0'
                    block.style.pointerEvents = 'none'
                }
            }
        }
        document.addEventListener('click', this.linkClickHandler, true)
    }

    stopObserver() {
        if (this.observer) {
            this.observer.disconnect()
            this.observer = null
        }
    }

    stopUrlMonitoring() {
        if (this.urlCheckInterval) {
            clearInterval(this.urlCheckInterval)
            this.urlCheckInterval = null
        }

        if (this.popstateHandler) {
            window.removeEventListener('popstate', this.popstateHandler)
            this.popstateHandler = null
        }

        if (this.linkClickHandler) {
            document.removeEventListener('click', this.linkClickHandler, true)
            this.linkClickHandler = null
        }

        this.onPageChange = null
    }

    stopPeriodicCheck() {
        if (this.periodicCheckInterval) {
            clearInterval(this.periodicCheckInterval)
            this.periodicCheckInterval = null
        }
    }

    removeBlock() {
        const existingBlock = document.getElementById(SELECTORS.STATS_BLOCK_ID)
        if (existingBlock) {
            existingBlock.remove()
        }
    }
}
