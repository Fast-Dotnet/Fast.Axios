/**
 * Webpack 小程序 Axios polyfill 插件入口
 *
 * @packageDocumentation
 */

import { uniAppAxiosUnplugin } from "./unplugin";

/**
 * Webpack 配置需要的最小插件契约
 *
 * compiler 保持 unknown，避免消费项目未安装 Webpack 时仅解析本包根声明就被迫加载 Webpack 类型。
 */
export interface FastAxiosWebpackPlugin {
	/** Webpack 调用此方法，把插件注册到当前 compiler。 */
	apply(compiler: unknown): void;
}

/** 创建 Webpack 小程序 Axios polyfill 插件。 */
const webpackPlugin = (options?: unknown): FastAxiosWebpackPlugin => uniAppAxiosUnplugin.webpack(options) as FastAxiosWebpackPlugin;

export default webpackPlugin;
