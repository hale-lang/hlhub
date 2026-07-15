// E2E: load the built extension (dist/) into Playwright's Chromium and
// verify both surfaces against real github.com pages:
//   1. the ```hale fence in hale-lang/pond/heron's README
//   2. the virtualized blob view of heron.hl (incl. scroll re-patching)
// Requires: npm run build, npx playwright install chromium --no-shell.
import { chromium } from 'playwright';

const dist = new URL('../dist', import.meta.url).pathname;
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium', // full build; the default headless shell can't load extensions
  headless: true,
  args: [
    `--disable-extensions-except=${dist}`,
    `--load-extension=${dist}`,
  ],
});

const page = await context.newPage();
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

// --- 1. README fence ---
await page.goto('https://github.com/hale-lang/pond/tree/main/heron', {
  waitUntil: 'domcontentloaded',
});
await page.locator('article pre[lang="hale"]').waitFor({ timeout: 20000 });
await page.waitForFunction(
  () => document.querySelectorAll('article pre span.pl-k').length > 0,
  null,
  { timeout: 20000 }
);
const fenceKeywords = await page.locator('article pre span.pl-k').count();
check('README fence has pl-k spans', fenceKeywords > 3, `${fenceKeywords} keyword spans`);

// --- 2. blob view ---
await page.goto('https://github.com/hale-lang/pond/blob/main/heron/heron.hl', {
  waitUntil: 'domcontentloaded',
});
await page.locator('.react-file-line').first().waitFor({ timeout: 20000 });
await page.waitForFunction(
  () => document.querySelectorAll('.react-file-line span[class^="pl-"]').length > 20,
  null,
  { timeout: 20000 }
);
const blobSpans = await page.locator('.react-file-line span[class^="pl-"]').count();
check('blob view lines have pl-* spans', blobSpans > 20, `${blobSpans} spans`);

const line26 = await page.locator('#LC26').innerHTML();
check('line 26 (@ffi decl) is styled', /pl-/.test(line26), line26.slice(0, 120));

// Scroll deep into the virtualized view; recycled lines must get patched.
await page.keyboard.press('End'); // jump to bottom of file
await page.waitForTimeout(1500);
const lastLines = await page.evaluate(() => {
  const els = [...document.querySelectorAll('.react-file-line[data-line-number]')];
  const max = Math.max(...els.map((e) => +e.dataset.lineNumber));
  return {
    max,
    styledNearEnd: els.filter(
      (e) => +e.dataset.lineNumber > max - 40 && e.querySelector('span[class^="pl-"]')
    ).length,
  };
});
check(
  'lines mounted after scrolling are styled',
  lastLines.styledNearEnd > 5,
  `${lastLines.styledNearEnd} styled among last 40 lines (file has ${lastLines.max})`
);

await page.screenshot({ path: process.env.E2E_SHOT ?? '/tmp/hlhub-e2e.png', fullPage: false });
await context.close();

if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('e2e OK');
