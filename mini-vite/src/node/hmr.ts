import { ServerContext } from "./server/index";
import { blue, green } from "picocolors";
import { getShortName, normalizePath } from "./utils";

export function bindingHMREvents(serverContext: ServerContext) {
  const { watcher, ws, root } = serverContext;

  watcher.on("change", async (file) => {
    console.log(`✨${blue("[hmr]")} ${green(file)} changed`);
    const { moduleGraph } = serverContext;
    await moduleGraph.invalidateModule(file);
    ws.send({
      type: "update",
      updates: [
        {
          type: "js-update",
          timestamp: Date.now(),
          path: "/" + getShortName(normalizePath(file), root),
          acceptedPath: "/" + getShortName(normalizePath(file), root),
        },
      ],
    });
  });
}
