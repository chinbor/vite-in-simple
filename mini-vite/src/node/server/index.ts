import connect from "connect";
import { optimize } from "../optimizer/index";
import { blue, green } from "picocolors";
import { transformMiddleware } from "./middlewares/transform";
import { ModuleGraph } from "../ModuleGraph";
import { createPluginContainer, PluginContainer } from "../pluginContainer";
import { resolvePlugins } from "../plugins";
import { indexHtmlMiddware } from "./middlewares/indexHtml";
import { staticMiddleware } from "./middlewares/static";
import { createWebSocketServer } from "../ws";
import chokidar, { FSWatcher } from "chokidar";
import { bindingHMREvents } from "../hmr";
import { Plugin } from "../plugin";
import { normalizePath } from "../utils";

export interface ServerContext {
  root: string;
  pluginContainer: PluginContainer;
  app: connect.Server;
  plugins: Plugin[];
  moduleGraph: ModuleGraph;
  ws: { send: (data: any) => void; close: () => void };
  watcher: FSWatcher;
}

export async function startDevServer() {
  const app = connect();
  const root = process.cwd();
  const startTime = Date.now();
  // 解析项目的所有插件
  const plugins = resolvePlugins();
  // 生成模块图
  const moduleGraph = new ModuleGraph((url) => pluginContainer.resolveId(url));
  // 创建插件容器，统一对插件进行调度
  const pluginContainer = createPluginContainer(plugins);
  // 监听文件的变化
  const watcher = chokidar.watch(root, {
    ignored: ["**/node_modules/**", "**/.git/**"],
    ignoreInitial: true,
  });
  // 创建 WebSocket 对象
  const ws = createWebSocketServer(app);
  // 开发服务器上下文
  const serverContext: ServerContext = {
    root: normalizePath(process.cwd()),
    app,
    pluginContainer,
    plugins,
    moduleGraph,
    ws,
    watcher,
  };

  // 绑定文件监听类型
  bindingHMREvents(serverContext);

  // 依次调用插件的 configureServer hook
  for (const plugin of plugins) {
    if (plugin.configureServer) {
      await plugin.configureServer(serverContext);
    }
  }

  // 核心编译逻辑
  app.use(transformMiddleware(serverContext));

  // 入口 HTML 资源
  app.use(indexHtmlMiddware(serverContext));

  // 静态资源
  app.use(staticMiddleware(serverContext.root));

  app.listen(3000, async () => {
    // 启动服务的时候就需要进行依赖预构建
    await optimize(root);
    console.log(
      green("🚀 No-Bundle 服务已经成功启动!"),
      `耗时: ${Date.now() - startTime}ms`
    );
    console.log(`> 本地访问路径: ${blue("http://localhost:3000")}`);
  });
}
