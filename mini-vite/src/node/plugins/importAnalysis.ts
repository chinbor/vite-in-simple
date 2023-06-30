import { init, parse } from "es-module-lexer";
import {
  BARE_IMPORT_RE,
  CLIENT_PUBLIC_PATH,
  PRE_BUNDLE_DIR,
} from "../constants";
import {
  cleanUrl,
  getShortName,
  isInternalRequest,
  isJSRequest,
  isWindows,
  normalizePath,
} from "../utils";
import MagicString from "magic-string";
import path from "path";
import { Plugin } from "../plugin";
import { ServerContext } from "../server/index";

export function importAnalysisPlugin(): Plugin {
  let serverContext: ServerContext;
  return {
    name: "m-vite:import-analysis",
    configureServer(s) {
      serverContext = s;
    },
    async transform(code: string, id: string) {
      if (!isJSRequest(id) || isInternalRequest(id)) {
        return null;
      }
      await init;
      const importedModules = new Set<string>();
      // 获取code内容中的 导入对象
      const [imports] = parse(code);
      const ms = new MagicString(code);

      // id表示当前模块 importer表示导入当前模块的其他模块
      const resolve = async (id: string, importer?: string) => {
        // 主要是调用的resolve插件
        const resolved = await serverContext.pluginContainer.resolveId(
          id,
          normalizePath(importer)
        );
        if (!resolved) {
          return;
        }
        const cleanedId = cleanUrl(resolved.id);
        const mod = moduleGraph.getModuleById(cleanedId);
        let resolvedId = `/${getShortName(resolved.id, serverContext.root)}`;
        if (mod && mod.lastHMRTimestamp > 0) {
          resolvedId += "?t=" + mod.lastHMRTimestamp;
        }
        return resolvedId;
      };

      const { moduleGraph } = serverContext;
      // 当前模块一定是存在了！！！因为在进入这里之前就已经调用 moduleGraph.ensureEntryFromUrl(url) 创建了moduleNode
      const curMod = moduleGraph.getModuleById(id)!;

      for (const importInfo of imports) {
        const { s: modStart, e: modEnd, n: modSource } = importInfo;
        if (!modSource || isInternalRequest(modSource)) continue;
        // 静态资源
        if (modSource.endsWith(".svg")) {
          // 加上 ?import 后缀
          // 调用resolve进行路径的解析，解析成能够访问到的路径
          const resolvedUrl = await resolve(modSource, id);
          ms.overwrite(modStart, modEnd, `${resolvedUrl}?import`);
          continue;
        }
        // 第三方库: 路径重写到预构建产物的路径
        if (BARE_IMPORT_RE.test(modSource)) {
          const bundlePath = normalizePath(
            path.join('/', PRE_BUNDLE_DIR, `${modSource}.js`)
          );
          ms.overwrite(modStart, modEnd, bundlePath);
          importedModules.add(bundlePath);
        } else if (modSource.startsWith(".") || modSource.startsWith("/")) {
          // 内部会处理main.tsx的imports（./App ./index.css）
          // 调用resolve进行路径的解析，解析成能够访问到的路径
          const resolved = await resolve(modSource, id);
          if (resolved) {
            ms.overwrite(modStart, modEnd, resolved);
            importedModules.add(resolved);
          }
        }
      }

      // 只对业务源码注入
      if (!id.includes("node_modules")) {
        // 注入 HMR 相关的工具函数
        ms.prepend(
          `import { createHotContext as __vite__createHotContext } from "${CLIENT_PUBLIC_PATH}";` +
            `import.meta.hot = __vite__createHotContext(${JSON.stringify(
              cleanUrl(curMod.url)
            )});`
        );
      }

      // 更新moduleNode的importers跟importedModules关系
      moduleGraph.updateModuleInfo(curMod, importedModules);

      return {
        code: ms.toString(),
        map: ms.generateMap(),
      };
    },
  };
}
