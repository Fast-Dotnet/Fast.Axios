import type { CacheManage } from "./types/cache";

// 按缓存容器隔离降级索引，原始请求身份仅保存在内存中，不交给缓存处理器。
const localCacheKeys = new WeakMap<CacheManage, { generation: number; entries: Map<string, { key: string; expiresAt: number }> }>();
let localCacheKeySequence = 0;

/**
 * 根据缓存上下文和请求身份生成不透明缓存键。
 *
 * @remarks
 * 有 Web Crypto 和 TextEncoder 时使用 SHA-256；否则使用当前容器内的编号映射。
 * 降级索引最多保留 256 项，每项自创建起有效 5 分钟，过期项在后续查找时清理。
 * SHA-256 摘要失败时 Promise 拒绝，不自动切换到编号映射。
 *
 * @param cache - 用于隔离降级索引的缓存容器
 * @param namespace - 当前请求的身份、租户或语言上下文
 * @param requestKey - 已序列化的请求身份，可包含凭据，不应记录或持久化
 * @param generation - 请求开始时记录的缓存失效代数
 * @returns 可交给缓存处理器的不透明键
 */
export const createCacheKey = async (cache: CacheManage, namespace: string, requestKey: string, generation: number): Promise<string> => {
	const identity = JSON.stringify([namespace, requestKey, generation]);
	if (globalThis.crypto?.subtle && typeof TextEncoder !== "undefined") {
		const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
		return `fast-cache:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
	}

	let state = localCacheKeys.get(cache);
	if (state === undefined || state.generation !== generation) {
		state = { generation, entries: new Map() };
		localCacheKeys.set(cache, state);
	}
	const now = Date.now();
	for (const [identityKey, entry] of state.entries) {
		if (entry.expiresAt <= now) state.entries.delete(identityKey);
	}
	const existing = state.entries.get(identity);
	if (existing !== undefined) return existing.key;
	if (state.entries.size >= 256) {
		const oldestKey = state.entries.keys().next().value;
		if (oldestKey !== undefined) state.entries.delete(oldestKey);
	}
	const key = `fast-cache:local:${++localCacheKeySequence}`;
	state.entries.set(identity, { key, expiresAt: now + 300_000 });
	return key;
};

/**
 * 释放指定缓存容器的降级身份索引。
 *
 * @remarks 由 CacheManage.clear() 调用；本函数不清空响应缓存，也不递增缓存失效代数。
 *
 * @param cache - 需要释放索引的缓存容器
 */
export const clearCacheKeys = (cache: CacheManage): void => {
	localCacheKeys.delete(cache);
};
