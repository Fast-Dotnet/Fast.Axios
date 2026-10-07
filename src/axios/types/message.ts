/** 展示一条指定级别消息的处理函数。 */
type MessageHandle = (message: string) => void;
/** 为消息展示函数附加实现替换入口。 */
interface MessageUseHandle {
	/** 使用新的消息展示函数替换当前级别的实现。 */
	use: (fn: MessageHandle) => void;
}

/**
 * Fast 项目的四类消息提示处理器
 *
 * 默认输出到控制台；`.use()` 可替换为 Element Plus、uni-app 或项目自己的消息组件。
 */
export class MessageManage {
	/** 当前实际执行的四类消息函数，每一类均可单独替换。 */
	private readonly _handle: {
		success: MessageHandle;
		warning: MessageHandle;
		info: MessageHandle;
		error: MessageHandle;
	};

	/** 展示成功消息；`.use(fn)` 会替换默认控制台实现。 */
	readonly success: MessageHandle & MessageUseHandle;
	/** 展示警告消息；`.use(fn)` 会替换默认控制台实现。 */
	readonly warning: MessageHandle & MessageUseHandle;
	/** 展示普通信息；`.use(fn)` 会替换默认控制台实现。 */
	readonly info: MessageHandle & MessageUseHandle;
	/** 展示 HTTP、网络或 Fast 业务错误；`.use(fn)` 会替换默认控制台实现。 */
	readonly error: MessageHandle & MessageUseHandle;

	/** 创建默认输出到浏览器或运行时控制台的消息处理器。 */
	constructor() {
		this._handle = {
			// 默认实现保留统一前缀，便于在控制台中定位 SDK 输出。
			success: (message: string): void => {
				// eslint-disable-next-line no-console -- 默认消息处理器使用控制台输出普通级别消息
				console.log(`[Fast.Axios] ${message}`);
			},
			// warning 使用 console.warn，使开发工具按警告级别展示。
			warning: (message: string): void => {
				console.warn(`[Fast.Axios] ${message}`);
			},
			// 普通信息不提升日志级别，使用 console.log 输出。
			info: (message: string): void => {
				// eslint-disable-next-line no-console -- 默认消息处理器使用控制台输出普通级别消息
				console.log(`[Fast.Axios] ${message}`);
			},
			// error 使用 console.error，未接入 UI 消息组件时仍能看到请求错误。
			error: (message: string): void => {
				console.error(`[Fast.Axios] ${message}`);
			},
		};

		// 每个代理都保持对外函数引用稳定，并把调用转发给该级别的最新实现。
		const successProxy: MessageHandle & MessageUseHandle = (message: string): void => {
			this._handle.success(message);
		};
		// 只替换 success 实现，不改变 warning、info 和 error 的处理方式。
		successProxy.use = (fn: MessageHandle): void => {
			this._handle.success = fn;
		};
		this.success = successProxy;

		// warning 代理把消息转发给当前警告处理函数。
		const warningProxy: MessageHandle & MessageUseHandle = (message: string): void => {
			this._handle.warning(message);
		};
		// 只替换 warning 实现，适合接入 UI 组件的警告方法。
		warningProxy.use = (fn: MessageHandle): void => {
			this._handle.warning = fn;
		};
		this.warning = warningProxy;

		// info 代理把消息转发给当前普通信息处理函数。
		const infoProxy: MessageHandle & MessageUseHandle = (message: string): void => {
			this._handle.info(message);
		};
		// 只替换 info 实现，适合接入 UI 组件的普通消息方法。
		infoProxy.use = (fn: MessageHandle): void => {
			this._handle.info = fn;
		};
		this.info = infoProxy;

		// error 代理把请求流程生成的错误消息转发给当前错误处理函数。
		const errorProxy: MessageHandle & MessageUseHandle = (message: string): void => {
			this._handle.error(message);
		};
		// 只替换 error 实现，不影响其他消息级别。
		errorProxy.use = (fn: MessageHandle): void => {
			this._handle.error = fn;
		};
		this.error = errorProxy;
	}
}
