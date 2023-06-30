import { NextHandleFunction } from "connect";
import { CLIENT_PUBLIC_PATH } from "../../constants";
import {
  isJSRequest,
  isCSSRequest,
  isImportRequest,
  isInternalRequest,
  cleanUrl,
} from "../../utils";
import { ServerContext } from "../index";
import createDebug from "debug";

const debug = createDebug("dev");

export async function transformRequest(
  url: string,
  serverContext: ServerContext
) {
  const { moduleGraph, pluginContainer } = serverContext;
  url = cleanUrl(url);

  let mod = await moduleGraph.getModuleByUrl(url);

  if (mod && mod.transformResult) {
    return mod.transformResult;
  }

  // 解析url生成真实的路径,调用插件的所有resolveId方法，直到遇到一个不为null则结束
  const resolvedResult = await pluginContainer.resolveId(url);
  let transformResult;

  if (resolvedResult?.id) {
    // 根据真实的路径加载文件
    let code = await pluginContainer.load(resolvedResult.id);

    if (typeof code === "object" && code !== null) {
      code = code.code;
    }

    // 创建moduleNode
    mod = await moduleGraph.ensureEntryFromUrl(url);

    if (code) {
      // 对加载后文件内容进行转换
      transformResult = await pluginContainer.transform(
        code as string,
        resolvedResult?.id
      );
    }
  }

  if (mod) {
    mod.transformResult = transformResult;
  }

  return transformResult;
}

export function transformMiddleware(
  serverContext: ServerContext
): NextHandleFunction {
  return async (req, res, next) => {
    if (req.method !== "GET" || !req.url) {
      return next();
    }
    const url = req.url;
    debug("transformMiddleware: %s", url);
    // transform JS and CSS request
    if (
      isJSRequest(url) ||
      isCSSRequest(url) ||
      // 静态资源的 import 请求，如 import logo from './logo.svg?import';
      isImportRequest(url)
    ) {
      let result = await transformRequest(url, serverContext);
      if (!result) {
        return next();
      }
      if (result && typeof result !== "string") {
        result = result.code;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/javascript");
      return res.end(result);
    }

    next();
  };
}
