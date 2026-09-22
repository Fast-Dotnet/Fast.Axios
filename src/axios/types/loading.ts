import type { AxiosOptions } from "./options";

/** 显示 Loading 的处理函数，参数为当前请求配置的提示文字。 */
type LoadingShowHandle = (text: string) => void;
/** 为 Loading 显示函数附加实现替换入口。 */
interface LoadingShowUseHandle {
	/** 使用新的 Loading 显示函数替换当前实现。 */
	use: (fn: LoadingShowHandle) => void;
}
/** 关闭 Loading 的处理函数，可根据请求选项处理并发计数等逻辑。 */
type LoadingCloseHandle = (options: AxiosOptions) => void;
/** 为 Loading 关闭函数附加实现替换入口。 */
interface LoadingCloseUseHandle {
	/** 使用新的 Loading 关闭函数替换当前实现。 */
	use: (fn: LoadingCloseHandle) => void;
}

/**
 * 请求 Loading 生命周期处理器。
 *
 * 默认实现为空；Fast 项目应通过 `.use()` 接入自己的 UI 组件，并自行处理并发请求计数。
 */
export class LoadingManage {
	/** 当前实际执行的显示与关闭函数。 */
	private readonly _handle: {
		show: LoadingShowHandle;
		close: LoadingCloseHandle;
	};

	/** 请求发送前显示 Loading。 */
	readonly show: LoadingShowHandle & LoadingShowUseHandle;
	/**
	 * 调用已注册的 Loading 关闭处理器。
	 *
	 * @remarks 请求流程负责与成功执行的 show 配对；手动调用不会验证显示状态，调用方须自行保证配对。
	 */
	readonly close: LoadingCloseHandle & LoadingCloseUseHandle;

	/** 创建默认不操作任何 UI 的 Loading 处理器。 */
	constructor() {
		this._handle = {
			// SDK 不依赖具体 UI 库，因此默认显示函数为空实现。
			show: (_text: string): void => {
				return;
			},
			// 默认关闭函数同样为空，由项目按所用 UI 框架自行接入。
			close: (_options: AxiosOptions): void => {
				return;
			},
		};

		// 显示代理保留稳定引用，并在调用时读取最新注册的实现。
		const showProxy: LoadingShowHandle & LoadingShowUseHandle = (text: string): void => {
			this._handle.show(text);
		};
		// 替换后续请求的显示逻辑，不会立即触发 Loading。
		showProxy.use = (fn: LoadingShowHandle): void => {
			this._handle.show = fn;
		};
		this.show = showProxy;

		// 关闭代理会把本次请求的 Fast 配置传给项目实现。
		const closeProxy: LoadingCloseHandle & LoadingCloseUseHandle = (options: AxiosOptions): void => {
			this._handle.close(options);
		};
		// 替换后续请求的关闭逻辑，不会立即关闭当前 Loading。
		closeProxy.use = (fn: LoadingCloseHandle): void => {
			this._handle.close = fn;
		};
		this.close = closeProxy;
	}
}
