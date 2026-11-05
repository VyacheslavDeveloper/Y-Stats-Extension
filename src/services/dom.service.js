import { SELECTORS, TIMINGS, MONITORING } from '../config/constants.js'
import { isApplicationsPage } from '../utils/helpers.js'

export class DomService {
    constructor(view) {
        this.view = view
        this.observer = null
        this.initAttempts = 0
        this.urlCheckInterval = null
        this.periodicCheckInterval = null
        this.currentUrl = window.location.href
        this.popstateHandler = null
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

        if (appsHeader && page) {
            const statsBlock = this.view.create()
            mainElement.insertBefore(statsBlock, page)
            this.initAttempts = 0
            this.onBlockInserted?.()
            return true
        }

        return false
    }

    tryInsert() {
        if (!isApplicationsPage()) {
            this.initAttempts = 0
            return
        }
        this.initAttempts++
        const success = this.insert()

        if (success) {
            this.initAttempts = 0
        } else if (this.initAttempts < TIMINGS.MAX_INIT_ATTEMPTS) {
            setTimeout(() => this.tryInsert(), TIMINGS.INIT_RETRY_INTERVAL)
        }
    }

    startObserver() {
        if (this.observer) return
        this.observer = new MutationObserver(() => {
            if (isApplicationsPage() && !this.view.isInDOM()) {
                this.insert()
            } else if (!isApplicationsPage() && this.view.isInDOM()) {
                this.removeBlock()
            }
        })

        if (document.body) {
            this.observer.observe(document.body, {
                childList: true,
                subtree: true,
            })
        }
    }

    startPeriodicCheck() {
        if (this.periodicCheckInterval !== null) return
        this.periodicCheckInterval = setInterval(() => {
            if (isApplicationsPage() && !this.view.isInDOM()) {
                this.insert()
            } else if (!isApplicationsPage() && this.view.isInDOM()) {
                this.removeBlock()
            }
        }, MONITORING.PERIODIC_CHECK_INTERVAL)
    }

    startUrlMonitoring(onPageChange) {
        this.onPageChange = onPageChange
        if (this.urlCheckInterval !== null) return

        this.urlCheckInterval = setInterval(() => {
            const newUrl = window.location.href

            if (newUrl !== this.currentUrl) {
                this.currentUrl = newUrl

                if (this.onPageChange) {
                    this.onPageChange(window.location.pathname)
                }
            }
        }, MONITORING.URL_CHECK_INTERVAL)

        const popstateHandler = () => {
            const newUrl = window.location.href
            if (newUrl !== this.currentUrl) {
                this.currentUrl = newUrl
                if (this.onPageChange) {
                    this.onPageChange(window.location.pathname)
                }
            }
        }
        window.addEventListener('popstate', popstateHandler)
        window.addEventListener('hashchange', popstateHandler)
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
            window.removeEventListener('hashchange', this.popstateHandler)
            this.popstateHandler = null
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
        this.view.destroy()
        const existingBlock = document.getElementById(SELECTORS.STATS_BLOCK_ID)
        if (existingBlock) {
            existingBlock.remove()
        }
    }
}
