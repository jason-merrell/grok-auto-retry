import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

const MEDIA_ID_REGEX = /imagine-public\/images\/([a-f0-9-]+)\.png/i

export function extractMediaIdFromSrc(src?: string | null): string | null {
    if (!src) {
        return null
    }
    const match = src.match(MEDIA_ID_REGEX)
    return match ? match[1] : null
}

export function findPrimaryMediaId(): string | null {
    const root = document.querySelector("video#sd-video")?.closest(".group.relative")
    const candidate = root?.querySelector<HTMLImageElement>("img[src*='imagine-public/images/']")
    if (candidate) {
        const id = extractMediaIdFromSrc(candidate.getAttribute("src"))
        if (id) {
            return id
        }
    }

    const fallback = document.querySelector<HTMLImageElement>("img[src*='imagine-public/images/']")
    return extractMediaIdFromSrc(fallback?.getAttribute("src"))
}
