/** 根据请求唯一标识读取缓存；未命中时应返回 `null` 或 `undefined`。 */
type CacheGetHandle = (key: string) => unknown;
/** 为缓存读取函数附加实现替换入口。 */
interface CacheGetUseHandle {
	/** 使用新的缓存读取函数替换当前实现。 */
	use: (fn: CacheGetHandle) => void;
}
/** 将请求最终返回值写入指定缓存键。 */
type CacheSetHandle = (key: string, value: unknown) => void;
/** 为缓存写入函数附加实现替换入口。 */
interface CacheSetUseHandle {
	/** 使用新的缓存写入函数替换当前实现。 */
	use: (fn: CacheSetHandle) => void;
}

/**
 * Fast 请求缓存处理器。
 *
 * 默认使用最多 256 项、5 分钟有效期的内存 Map；调用 `get.use()` 或 `set.use()` 可分别接入项目已有的本地缓存、状态仓库或持久化缓存。
 */
export class CacheManage {
	/** 当前实际执行的缓存函数；调用 `.use()` 时只替换这里保存的实现。 */
	private readonly _handle: {
		get: CacheGetHandle;
		set: CacheSetHandle;
	};

	/** 按请求 key 读取缓存；`.use(fn)` 会替换默认读取实现。 */
	readonly get: CacheGetHandle & CacheGetUseHandle;
	/** 按请求 key 写入最终响应值；`.use(fn)` 会替换默认写入实现。 */
	readonly set: CacheSetHandle & CacheSetUseHandle;

	/** 未注册自定义缓存处理器时使用的进程内缓存。 */
	private readonly _cacheRecord = new Map<string, { value: unknown; expiresAt: number }>();
	private _namespace = "";
	private _generation = 0;
	// 隔离不同容器实例及页面重启后的持久化后端，不让失效代数重置重新命中旧键。
	private readonly _instanceKey = globalThis.crypto?.getRandomValues
		? Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)), (value) => value.toString(16)).join("-")
		: `${Date.now()}-${Math.random()}`;

	private qualifyKey(key: string): string {
		return `${this._instanceKey}:${this._generation}:${key}`;
	}

	/** 当前身份/租户/语言的缓存命名空间；空值禁用请求流程中的缓存。 */
	get namespace(): string {
		return this._namespace;
	}

	set namespace(value: string) {
		if (typeof value !== "string") throw new TypeError("缓存命名空间必须是字符串。");
		if (value !== this._namespace) {
			this._namespace = value;
			this.clear();
		}
	}

	/** 缓存失效代数，用于阻止旧请求在退出登录或切换上下文后重新写入 */
	get generation(): number {
		return this._generation;
	}

	/**
	 * 使当前缓存失效，并清空默认内存存储。
	 *
	 * @remarks 自定义后端的旧键不再被请求流程读取，但物理删除和 TTL 仍由后端负责。退出登录或 Cookie 会话变化时应调用本方法。
	 */
	clear(): void {
		this._generation += 1;
		this._cacheRecord.clear();
	}

	/** 创建带有默认内存缓存实现的处理器。 */
	constructor() {
		this._handle = {
			get: (key: string): unknown => {
				const entry = this._cacheRecord.get(key);
				if (entry === undefined) return null;
				if (entry.expiresAt <= Date.now()) {
					this._cacheRecord.delete(key);
					return null;
				}
				return entry.value;
			},
			set: (key: string, value: unknown): void => {
				// 默认缓存最多保留 256 项、每项 5 分钟；需要其他策略时使用既有 get/set 扩展点。
				this._cacheRecord.delete(key);
				if (this._cacheRecord.size >= 256) {
					const oldestKey = this._cacheRecord.keys().next().value;
					if (oldestKey !== undefined) this._cacheRecord.delete(oldestKey);
				}
				this._cacheRecord.set(key, { value, expiresAt: Date.now() + 300_000 });
			},
		};

		// 对外暴露稳定的函数引用，实际调用始终转发给 _handle.get 的当前实现。
		const getProxy: CacheGetHandle & CacheGetUseHandle = (key: string): unknown => {
			return this._handle.get(this.qualifyKey(key));
		};
		// 只替换内部实现，已经获取过 this.get 的调用方也会立即使用新函数。
		getProxy.use = (fn: CacheGetHandle): void => {
			this._handle.get = fn;
		};
		this.get = getProxy;

		// 写入代理与读取代理采用相同机制，使 `set()` 与 `set.use()` 共用一个入口。
		const setProxy: CacheSetHandle & CacheSetUseHandle = (key: string, value: unknown): void => {
			this._handle.set(this.qualifyKey(key), value);
		};
		// 替换后续写入逻辑，例如接入 Pinia、localStorage 或其他持久化存储。
		setProxy.use = (fn: CacheSetHandle): void => {
			this._handle.set = fn;
		};
		this.set = setProxy;
	}
}
