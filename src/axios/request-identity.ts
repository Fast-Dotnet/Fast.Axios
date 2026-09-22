/**
 * 为自动去重编码普通请求体；文件、流、循环引用和带自定义原型的数据必须由调用方显式提供标识。
 * 不使用对象类型名作为降级键，否则不同文件可能被错误取消。
 */
export function serializeRequestBody(value: unknown): string | undefined {
	if (value === undefined) return "undefined";
	if (typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams) return `query:${value.toString()}`;
	const visited = new WeakSet();
	const isJsonValue = (input: unknown): boolean => {
		if (input === null || typeof input === "string" || typeof input === "boolean") return true;
		if (typeof input === "number") return Number.isFinite(input);
		if (typeof input !== "object" || visited.has(input)) return false;
		if (!Array.isArray(input) && Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) return false;
		visited.add(input);
		const valid = Reflect.ownKeys(input).every(
			(key) => !Object.prototype.propertyIsEnumerable.call(input, key) || (typeof key === "string" && isJsonValue(Reflect.get(input, key)))
		);
		visited.delete(input);
		return valid;
	};
	try {
		return isJsonValue(value) ? JSON.stringify(value) : undefined;
	} catch {
		return undefined;
	}
}

/** 在不修改调用方参数的前提下补充时间戳，并保留 URLSearchParams 的重复键。 */
export function appendCacheBuster(params: unknown, timestamp: number): unknown {
	if (typeof URLSearchParams !== "undefined" && params instanceof URLSearchParams) {
		const result = new URLSearchParams(params);
		result.set("_", String(timestamp));
		return result;
	}
	if (params == null) return { _: timestamp };
	if (typeof params === "object" && (Object.getPrototypeOf(params) === Object.prototype || Object.getPrototypeOf(params) === null)) {
		return { ...params, _: timestamp };
	}
	// 自定义序列化器可能接收非普通对象；不能为了防缓存而破坏该对象的协议。
	return params;
}
