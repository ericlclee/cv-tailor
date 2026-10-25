// Bundle the in-chat CV view (src/mcp-app/view.ts) into a single HTML file and
// write it to src/lib/mcp/app-html.generated.ts, which the MCP server serves as a
// ui:// resource. Runs before `next build` and `next dev` (see package.json).
import { build } from "esbuild";
import { writeFileSync } from "node:fs";

const { outputFiles } = await build({
  entryPoints: ["src/mcp-app/view.ts"],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  platform: "browser",
  write: false,
  legalComments: "none",
});
const js = outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

const css = `
:root{color-scheme:light dark;--bg:var(--color-background-primary,#fff);--bg2:var(--color-background-secondary,#f4f5f7);--text:var(--color-text-primary,#0e1116);--muted:var(--color-text-secondary,#5b6270);--border:var(--color-border-primary,#dcdfe4);--accent:#2443f2;--font:var(--font-sans,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif);--r:var(--border-radius-md,8px)}
[data-theme=dark]{--bg:var(--color-background-primary,#1f2023);--bg2:var(--color-background-secondary,#2a2b2f);--text:var(--color-text-primary,#ececee);--muted:var(--color-text-secondary,#a3a7af);--border:var(--color-border-primary,#3a3c41);--accent:#8ea0ff}
*{box-sizing:border-box}
html,body{margin:0;background:transparent;color:var(--text);font:14px/1.45 var(--font)}
#root{display:flex;flex-direction:column;gap:12px;padding:4px 2px 8px}
button{font:inherit;color:inherit;cursor:pointer}
button:disabled{cursor:default;opacity:.6}
.muted{color:var(--muted)}
.pad{padding:12px}
header{display:flex;flex-direction:column;gap:8px}
.title{display:flex;flex-direction:column}
.eyebrow{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.title strong{font-size:16px}
.controls{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.label{font-weight:600;font-size:13px}
.picker{display:flex;flex-wrap:wrap;gap:2px;padding:3px;border-radius:10px;background:var(--bg2)}
.picker button{display:flex;align-items:center;gap:6px;min-height:32px;padding:0 11px;border:0;border-radius:7px;background:transparent;font-size:13px;font-weight:500;color:var(--muted)}
.picker button.on{background:var(--bg);color:var(--text);box-shadow:0 1px 2px rgba(0,0,0,.15)}
.setting{margin:0;font-size:13px}
.warn{color:#b54708}
[data-theme=dark] .warn{color:#fdb022}
.actions{display:flex;flex-wrap:wrap;gap:8px}
.primary,.secondary{min-height:34px;padding:0 14px;border-radius:9px;font-weight:600;font-size:13px}
.primary{background:var(--accent);color:#fff;border:0}
[data-theme=dark] .primary{color:#0e1116}
.secondary{background:var(--bg);border:1px solid var(--border)}
.link{border:0;background:none;padding:0;color:var(--accent);font-size:13px;font-weight:500}
.notice{padding:8px 12px;border-radius:var(--r);font-size:13px;background:var(--bg2)}
.notice.error{border:1px solid #f04438}
.notice pre{white-space:pre-wrap;margin:6px 0 0;font:12px/1.4 var(--font-mono,ui-monospace,monospace)}
.legend{padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--bg)}
.legend-head{display:flex;justify-content:space-between;gap:10px;font-size:13px;font-weight:500;color:var(--muted)}
.legend ul{list-style:none;margin:8px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:4px 14px}
.legend li{display:flex;align-items:baseline;gap:6px;font-size:12.5px}
.count{font:11px var(--font-mono,ui-monospace,monospace);color:var(--muted)}
.above-note{display:flex;align-items:center;gap:8px;margin:8px 0 0;font-size:12.5px;color:var(--muted)}
.dot{width:9px;height:9px;border-radius:50%;display:inline-block}
.sw{width:11px;height:11px;border-radius:3px;display:inline-block;flex:none;transform:translateY(1px)}
.sw.outline{width:18px;outline:1.5px dashed #b42318;outline-offset:-1px}
.l0.dot,.l0.sw{background:#fff;box-shadow:inset 0 0 0 1px #b9bfc8}
.l1.dot,.l1.sw{background:#c9d4ff}.l2.dot,.l2.sw{background:#ffd966}.l3.dot,.l3.sw{background:#ff9f94}
.page{background:#fff;color:#111;border-radius:6px;padding:26px 30px;box-shadow:0 1px 2px rgba(14,17,22,.1),0 6px 18px rgba(14,17,22,.08);font:12.5px/1.45 Arial,Helvetica,sans-serif}
.page h1{font-size:21px;margin:0}
.page h2{font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;border-bottom:1px solid #222;padding-bottom:2px;margin:14px 0 6px}
.page p{margin:0 0 3px}
.headline{font-size:13px;margin-top:2px!important}
.contact{font-size:11.5px;color:#333}
.item{margin-bottom:8px}
.item-head{display:flex;justify-content:space-between;gap:12px}
.dates{flex:none}
.page ul{margin:2px 0 0;padding-left:16px}
.page li{margin-bottom:2px}
.line{display:block;width:100%;text-align:left;border:0;background:none;padding:0;color:inherit;font:inherit;border-radius:3px}
.line:hover{background:rgba(36,67,242,.07)}
.hl{border-radius:3px;padding:0 2px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.hl.l1{background:#e3e9ff}.hl.l2{background:#ffecb0}.hl.l3{background:#ffd4cf}
.hl.above{outline:1.5px dashed #b42318;outline-offset:1px}
.line-actions{display:flex;flex-direction:column;gap:6px;margin:4px 0 6px;padding:8px 10px;border-radius:6px;background:#f4f6ff;font-family:var(--font);color:#111}
.line-actions .muted{color:#5b6270;font-size:12px}
.line-actions .notice{background:#fff;color:#111}
.row{display:flex;flex-wrap:wrap;gap:6px}
.chip{min-height:28px;padding:0 10px;border-radius:999px;border:1px solid #cfd5e3;background:#fff;color:#111;font-size:12.5px;font-weight:500}
.empty{display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:14px 16px;border:1.5px dashed var(--border);border-radius:10px}
.empty p{margin:0}
.hint{margin:0;font-size:12.5px}
footer{display:flex;gap:16px}
`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CV Tailor</title>
<style>${css.trim()}</style>
</head>
<body>
<div id="root"></div>
<script>${js}</script>
</body>
</html>`;

writeFileSync(
  "src/lib/mcp/app-html.generated.ts",
  `// Generated by scripts/build-mcp-app.mjs from src/mcp-app/view.ts. Don't edit by hand.\nexport const CV_VIEW_HTML = ${JSON.stringify(html)};\n`,
);
console.log(`MCP App view: ${(html.length / 1024).toFixed(0)} KB`);
