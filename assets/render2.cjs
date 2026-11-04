const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const svg = fs.readFileSync(__dirname + '/llama-icon.svg', 'utf8');
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setViewportSize({ width: 512, height: 512 });
  await p.setContent(`<body style="margin:0;background:#888"><div style="width:512px;height:512px;border-radius:110px;overflow:hidden">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body>`);
  await p.screenshot({ path: '/tmp/claude-0/shots/llama-icon.png' });
  await b.close();
})();
