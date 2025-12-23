import * as React from "react";

import type { ToastActionElement, ToastProps } from "@/components/ui/toast";

const TOAST_LIMIT = 5;
const TOAST_REMOVE_DELAY = 1000;

type ToasterToast = ToastProps & {
    id: string;
    title?: React.ReactNode;
    description?: React.ReactNode;
    action?: ToastActionElement;
};

type ToastState = {
    toasts: ToasterToast[];
};

const ADD_TOAST = "ADD_TOAST" as const;
const UPDATE_TOAST = "UPDATE_TOAST" as const;
const DISMISS_TOAST = "DISMISS_TOAST" as const;
const REMOVE_TOAST = "REMOVE_TOAST" as const;

type Action =
    | { type: typeof ADD_TOAST; toast: ToasterToast }
    | { type: typeof UPDATE_TOAST; toast: Partial<ToasterToast> }
    | { type: typeof DISMISS_TOAST; toastId?: string }
    | { type: typeof REMOVE_TOAST; toastId?: string };

type ToastHandlers = {
    addToast(toast: ToasterToast): void;
    updateToast(toast: Partial<ToasterToast>): void;
    dismissToast(toastId?: string): void;
};

type Toast = Partial<ToasterToast>;

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

const addToRemoveQueue = (toastId: string) => {
    if (toastTimeouts.has(toastId)) {
        return;
    }

    const timeout = setTimeout(() => {
        toastTimeouts.delete(toastId);
        dispatch({ type: REMOVE_TOAST, toastId });
    }, TOAST_REMOVE_DELAY);

    toastTimeouts.set(toastId, timeout);
};

const reducer = (state: ToastState, action: Action): ToastState => {
    switch (action.type) {
        case ADD_TOAST: {
            return {
                ...state,
                toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
            };
        }
        case UPDATE_TOAST: {
            return {
                ...state,
                toasts: state.toasts.map((toast) =>
                    toast.id === action.toast.id ? { ...toast, ...action.toast } : toast
                ),
            };
        }
        case DISMISS_TOAST: {
            const { toastId } = action;

            if (toastId) {
                addToRemoveQueue(toastId);
            } else {
                state.toasts.forEach((toast) => {
                    addToRemoveQueue(toast.id);
                });
            }

            return {
                ...state,
                toasts: state.toasts.map((toast) =>
                    toast.id === toastId || toastId === undefined
                        ? { ...toast, open: false }
                        : toast
                ),
            };
        }
        case REMOVE_TOAST: {
            if (action.toastId === undefined) {
                return {
                    ...state,
                    toasts: [],
                };
            }

            return {
                ...state,
                toasts: state.toasts.filter((toast) => toast.id !== action.toastId),
            };
        }
    }
};

const listeners = new Set<(state: ToastState) => void>();

let memoryState: ToastState = { toasts: [] };

const dispatch = (action: Action) => {
    memoryState = reducer(memoryState, action);
    listeners.forEach((listener) => {
        listener(memoryState);
    });
};

const toastHandlers: ToastHandlers = {
    addToast(toast) {
        dispatch({ type: ADD_TOAST, toast });
    },
    updateToast(toast) {
        dispatch({ type: UPDATE_TOAST, toast });
    },
    dismissToast(toastId) {
        dispatch({ type: DISMISS_TOAST, toastId });
    },
};

export function useToast() {
    const [state, setState] = React.useState<ToastState>(memoryState);

    React.useEffect(() => {
        listeners.add(setState);
        return () => {
            listeners.delete(setState);
        };
    }, []);

    return {
        ...state,
        toast: (props: Toast) => {
            const id = props.id ?? Math.random().toString(36).slice(2, 9);

            toastHandlers.addToast({
                ...props,
                id,
                open: true,
            });

            return {
                id,
                dismiss: () => toastHandlers.dismissToast(id),
            };
        },
        dismiss: toastHandlers.dismissToast,
    };
}

export type { ToastActionElement, ToastProps } from "@/components/ui/toast";
