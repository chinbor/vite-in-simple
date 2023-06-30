import { PartialResolvedId, TransformResult } from "rollup";
import { cleanUrl } from "./utils";

export class ModuleNode {
  // 资源访问 url
  url: string;
  // 资源绝对路径
  id: string | null = null;
  // 当前模块被哪些模块导入
  importers = new Set<ModuleNode>();
  // 当前模块导入的哪些模块
  importedModules = new Set<ModuleNode>();
  transformResult: TransformResult | null = null;
  lastHMRTimestamp = 0;
  constructor(url: string) {
    this.url = url;
  }
}

export class ModuleGraph {
  // 资源 url 到 ModuleNode 的映射表
  urlToModuleMap = new Map<string, ModuleNode>();
  // 资源绝对路径到 ModuleNode 的映射表
  idToModuleMap = new Map<string, ModuleNode>();

  constructor(
    private resolveId: (url: string) => Promise<PartialResolvedId | null>
  ) {}

  getModuleById(id: string): ModuleNode | undefined {
    return this.idToModuleMap.get(id);
  }

  async getModuleByUrl(rawUrl: string): Promise<ModuleNode | undefined> {
    const { url } = await this._resolve(rawUrl);
    return this.urlToModuleMap.get(url);
  }

  async ensureEntryFromUrl(rawUrl: string): Promise<ModuleNode> {
    const { url, resolvedId } = await this._resolve(rawUrl);
    // 首先检查缓存
    if (this.urlToModuleMap.has(url)) {
      return this.urlToModuleMap.get(url) as ModuleNode;
    }
    // 若无缓存，更新 urlToModuleMap 和 idToModuleMap
    const mod = new ModuleNode(url);
    mod.id = resolvedId;
    this.urlToModuleMap.set(url, mod);
    this.idToModuleMap.set(resolvedId, mod);
    return mod;
  }

  async updateModuleInfo(
    mod: ModuleNode,
    importedModules: Set<string | ModuleNode>
  ) {
    // 当前模块是否已经有导入的模块
    const prevImports = mod.importedModules;

    // 遍历导入的模块
    for (const curImports of importedModules) {
      // string则创建
      const dep =
        typeof curImports === "string"
          ? await this.ensureEntryFromUrl(cleanUrl(curImports))
          : curImports;

      if (dep) {
        // 当前模块更新他的导入模块集合
        mod.importedModules.add(dep);
        // 导入的模块更新他的被导入集合
        dep.importers.add(mod);
      }
    }

    // 清除已经不再被引用的依赖
    // 举个例子 mod = 1 importedModules = [2,3,4] prevImports = [3,4,5]
    // 遍历过后 mod.importedModules = [2,3,4,5]
    // prevImports跟mod.importedModules是同一个引用所以变成[2,3,4,5]
    // 5不在importedModules中，所以5的importers删除掉1，也就是1不会导入5，但是他妈的1的importedModules还是存在5啊
    for (const prevImport of prevImports) {
      if (!importedModules.has(prevImport.url)) {
        // BUG: 有点问题啊
        prevImport.importers.delete(mod);
      }
    }
  }

  invalidateModule(file: string) {
    const mod = this.idToModuleMap.get(file);
    if (mod) {
      mod.lastHMRTimestamp = Date.now();
      mod.transformResult = null;
      mod.importers.forEach((importer) => {
        this.invalidateModule(importer.id!);
      });
    }
  }

  private async _resolve(
    url: string
  ): Promise<{ url: string; resolvedId: string }> {
    const resolved = await this.resolveId(url);
    const resolvedId = resolved?.id || url;
    return { url, resolvedId };
  }
}
