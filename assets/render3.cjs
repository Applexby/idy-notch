const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const svg = fs.readFileSync(__dirname + '/llama-icon.svg', 'utf8').replace('<svg ', '<svg width="100%" height="100%" ');
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 1 });
  const shot = async (size, out, radius) => {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;border-radius:${radius}px;overflow:hidden">${svg}</div></body>`);
    await p.screenshot({ path: out, omitBackground: true });
  };
  const W = '/home/claude/idy-notch/web/public/icons/';
  await shot(180, W + 'apple-touch-icon.png', 0);
  await shot(192, W + 'icon-192.png', 40);
  await shot(512, W + 'icon-512.png', 110);
  await shot(512, W + 'icon-maskable-512.png', 0);
  await shot(1024, __dirname + '/app-icon-1024.png', 220);
  await b.close();
})();
