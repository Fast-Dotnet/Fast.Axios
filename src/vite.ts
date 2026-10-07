/**
 * Vite 小程序 Axios polyfill 插件入口
 *
 * @packageDocumentation
 */

import { uniAppAxiosUnplugin } from "./unplugin";

/**
 * Vite 配置需要的最小插件契约
 *
 * 只公开 Vite Plugin 的必需 name 字段，避免消费项目仅为读取本包声明而加载 unplugin 支持的所有构建器类型。
 */
export interface FastAxiosVitePlugin {
	/** Vite 和调试工具显示的插件名称 */
	name: string;
}

/** 创建 Vite 小程序 Axios polyfill 插件。 */
const vitePlugin: (options?: unknown) => FastAxiosVitePlugin = uniAppAxiosUnplugin.vite;

export default vitePlugin;
