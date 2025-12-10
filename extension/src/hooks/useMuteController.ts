import { useCallback, useEffect, useRef, useState } from "react";

interface MuteState {
    isMuted: boolean;
    isAvailable: boolean;
}

const MUTE_LABELS = new Set(["mute", "unmute"]);
const VIDEO_SELECTOR = 'video[id$="-video"]';

type MuteLabel = "Mute" | "Unmute";

function getCandidateVideos(): HTMLVideoElement[] {
    const preferred = Array.from(document.querySelectorAll<HTMLVideoElement>(VIDEO_SELECTOR));
    if (preferred.length > 0) {
        return preferred;
    }
    return Array.from(document.querySelectorAll<HTMLVideoElement>("video"));
}

function isElementVisible(el: HTMLElement): boolean {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
        return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

function getActiveVideo(videos: HTMLVideoElement[]): HTMLVideoElement | null {
    for (const video of videos) {
        if (isElementVisible(video)) {
            return video;
        }
    }
    return videos[0] ?? null;
}

function normalizeLabel(value: string | null | undefined): MuteLabel | null {
    if (!value) {
        return null;
    }
    const trimmed = value.trim();
    if (trimmed === "Mute" || trimmed === "Unmute") {
        return trimmed;
    }
    const lower = trimmed.toLowerCase();
    if (lower === "mute" || lower === "unmute") {
        return lower === "mute" ? "Mute" : "Unmute";
    }
    return null;
}

function getButtonActionLabel(button: HTMLButtonElement | null): MuteLabel | null {
    if (!button) {
        return null;
    }
    const aria = normalizeLabel(button.getAttribute("aria-label"));
    if (aria) {
        return aria;
    }
    const srOnlyNodes = Array.from(button.querySelectorAll<HTMLElement>(".sr-only"));
    for (const node of srOnlyNodes) {
        const label = normalizeLabel(node.textContent);
        if (label) {
            return label;
        }
    }
    return normalizeLabel(button.textContent);
}

function deriveMutedState(button: HTMLButtonElement | null, videos: HTMLVideoElement[]): boolean {
    const active = getActiveVideo(videos);
    if (active) {
        return Boolean(active.muted);
    }
    const label = getButtonActionLabel(button);
    if (label === "Mute") {
        return false;
    }
    if (label === "Unmute") {
        return true;
    }
    return false;
}

function findMuteButton(): HTMLButtonElement | null {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
    for (const button of buttons) {
        const aria = button.getAttribute("aria-label")?.trim().toLowerCase();
        if (aria && MUTE_LABELS.has(aria)) {
            return button;
        }
        const srOnlyNodes = Array.from(button.querySelectorAll<HTMLElement>(".sr-only"));
        for (const node of srOnlyNodes) {
            const text = node.textContent?.trim().toLowerCase();
            if (text && MUTE_LABELS.has(text)) {
                return button;
            }
        }
        const textContent = button.textContent?.trim().toLowerCase();
        if (textContent && MUTE_LABELS.has(textContent)) {
            return button;
        }
    }
    return null;
}

export function useMuteController(enabled: boolean) {
    const [state, setState] = useState<MuteState>({ isMuted: false, isAvailable: false });
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const videosRef = useRef(new Set<HTMLVideoElement>());
    const observerRef = useRef<MutationObserver | null>(null);
    const syncRef = useRef<() => void>(() => { });

    useEffect(() => {
        if (!enabled) {
            setState({ isMuted: false, isAvailable: false });
            syncRef.current = () => { };
            return;
        }

        let disposed = false;

        const handleVolumeChange = () => {
            if (disposed) {
                return;
            }
            syncRef.current();
        };

        const handleButtonClick = () => {
            if (disposed) {
                return;
            }
            requestAnimationFrame(() => syncRef.current());
        };

        const detachButtonListener = () => {
            if (buttonRef.current) {
                buttonRef.current.removeEventListener("click", handleButtonClick);
                buttonRef.current = null;
            }
        };

        const detachVideoListeners = () => {
            for (const video of Array.from(videosRef.current)) {
                video.removeEventListener("volumechange", handleVolumeChange);
                videosRef.current.delete(video);
            }
        };

        const attachVideos = () => {
            const candidates = getCandidateVideos();
            const nextSet = new Set(candidates);
            for (const video of Array.from(videosRef.current)) {
                if (!nextSet.has(video)) {
                    video.removeEventListener("volumechange", handleVolumeChange);
                    videosRef.current.delete(video);
                }
            }
            for (const video of candidates) {
                if (!videosRef.current.has(video)) {
                    video.addEventListener("volumechange", handleVolumeChange);
                    videosRef.current.add(video);
                }
            }
            return Array.from(videosRef.current);
        };

        const sync = () => {
            if (disposed) {
                return;
            }
            const button = findMuteButton();
            if (buttonRef.current !== button) {
                detachButtonListener();
                buttonRef.current = button;
                if (button) {
                    button.addEventListener("click", handleButtonClick);
                }
            }

            const videos = attachVideos();
            const isMuted = deriveMutedState(button, videos);
            const isAvailable = Boolean(button);

            setState((prev) => {
                if (prev.isMuted === isMuted && prev.isAvailable === isAvailable) {
                    return prev;
                }
                return { isMuted, isAvailable };
            });
        };

        syncRef.current = sync;
        sync();

        const observer = new MutationObserver(() => sync());
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["aria-label", "class", "style", "muted", "data-state"],
        });
        observerRef.current = observer;

        return () => {
            disposed = true;
            if (observerRef.current) {
                observerRef.current.disconnect();
                observerRef.current = null;
            }
            detachButtonListener();
            detachVideoListeners();
            syncRef.current = () => { };
        };
    }, [enabled]);

    const toggleMute = useCallback(() => {
        if (!enabled) {
            return false;
        }
        const button = buttonRef.current ?? findMuteButton();
        if (!button) {
            return false;
        }
        buttonRef.current = button;
        button.click();
        requestAnimationFrame(() => syncRef.current());
        return true;
    }, [enabled]);

    return {
        isMuted: state.isMuted,
        isAvailable: state.isAvailable,
        toggleMute,
    };
}
