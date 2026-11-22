export function abortable<T>(run: () => T | Promise<T>, signal?: AbortSignal): Promise<T>
