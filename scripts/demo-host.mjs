// Serves e2e/demo-host/index.html as a stand-in for a property's own website.
//   APP_ORIGIN=http://localhost:3000 WIDGET_KEY=pk_demo_seoul PORT=4173 node scripts/demo-host.mjs
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 4173);
const appOrigin = process.env.APP_ORIGIN ?? "http://localhost:3000";
const defaultKey = process.env.WIDGET_KEY ?? "pk_demo_seoul";
const template = readFileSync(new URL("../e2e/demo-host/index.html", import.meta.url), "utf8");

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  if (url.pathname !== "/") {
    res.writeHead(404).end();
    return;
  }
  const key = (url.searchParams.get("key") ?? defaultKey).replace(/[^\w-]/g, "");
  const html = template.replaceAll("__APP_ORIGIN__", appOrigin).replaceAll("__WIDGET_KEY__", key);
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
}).listen(port, () => console.log(`Demo host on http://localhost:${port} (app ${appOrigin})`));
