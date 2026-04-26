import { CURRENCY } from '../config/constants.js'

export function formatMoney(amount) {
    return new Intl.NumberFormat(CURRENCY.LOCALE, {
        style: 'currency',
        currency: CURRENCY.CODE,
        minimumFractionDigits: CURRENCY.FRACTION_DIGITS,
        maximumFractionDigits: CURRENCY.FRACTION_DIGITS,
    }).format(amount || 0)
}

export function formatDate(date) {
    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    })
}

const MILLION = 1_000_000
const THOUSAND = 1_000

export function formatCompactNumber(value) {
    const normalized = Number(value) || 0

    if (normalized >= MILLION) {
        return (normalized / MILLION).toFixed(1) + 'M'
    }

    if (normalized >= THOUSAND) {
        return (normalized / THOUSAND).toFixed(1) + 'K'
    }

    return Math.round(normalized).toString()
}

export function formatShortDate(date) {
    const day = date.getUTCDate()
    const month = date.getUTCMonth() + 1
    return `${day}.${month < 10 ? '0' + month : month}`
}

export function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function calculateRevenuePer1000Players(revenue, players) {
    if (!players || players === 0) return 0
    return (revenue / players) * 1000
}
