import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { read, utils } from 'xlsx';
import { unzipSync } from 'fflate';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, headless: true });
const root = process.env.TEST_BASE_URL || 'http://127.0.0.1:5803';
const sample = fileURLToPath(new URL('../public/demo/east-dispatch-input.xlsx', import.meta.url));
const photosSheet = fileURLToPath(new URL('../public/demo/loading-photo-register.xlsx', import.meta.url));
const photosBook = read(await readFile(photosSheet));
const photoPaths = process.env.GUIDE_PHOTO_DIR && utils.sheet_to_json(photosBook.Sheets[photosBook.SheetNames[0]]).map(r => join(process.env.GUIDE_PHOTO_DIR,r.图片文件名));
try {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  const btn = name => p.getByRole('button', { name, exact: true });
  const send = () => btn('发送').click();
  const input = p.getByPlaceholder('发消息...');
  async function summon(name) {
    await btn('新对话').click();
    await p.waitForURL(url => url.pathname === '/index/agent');
    await p.locator('.summon-trigger').click();
    await p.getByRole('searchbox').fill(name);
    await btn('召唤 ' + name).click();
  }
  const select = files => p.locator('input[type=file]').setInputFiles(files);
  await p.goto(root + '/index/agent');
  const projectGuides = ['装卸货地追溯留证', '运短骗长核查', '轨迹造假分析预警', '车机离线监控提醒', '异常停靠与偷串货预警', '同城倒短运单生成与监控', '装卸图片核验', '进场车辆核查'];
  for (const [projectName, entry] of [
    ['华东运输核查', p.locator('.summon-trigger')],
    ['异常停靠点风险分析', p.locator('.project-navigation').getByRole('button', { name: '数字人技能', exact: true })],
  ]) {
    await p.getByRole('button', { name: new RegExp('^' + projectName) }).click();
    for (const name of projectGuides) {
      await entry.click();
      const dialog = p.getByRole('dialog', { name: '数字人技能' });
      await dialog.getByRole('button', { name: '召唤 ' + name, exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await p.locator('.summon-trigger').innerText(), name);
      assert((await input.inputValue()).trim(), 'project summon must populate an editable prompt');
    }
    await send();
    const pending = p.locator('.agent-message.is-agent').last();
    await pending.getByText('处理中', { exact: true }).waitFor();
    assert(await btn('发送').isDisabled());
    await pending.locator('.agent-process-step').filter({ hasText: '核对进场条件与运输记录' }).waitFor();
    assert.equal(await pending.locator('.animate-spin').count(), 1);
    assert.equal(await pending.getByRole('button', { name: /在运单地图查看/ }).count(), 0);
    await p.getByText('转现场复核', { exact: false }).last().waitFor();
    assert.equal(await pending.locator('.animate-spin').count(), 0);
    assert(await btn('发送').isEnabled());
  }
  console.log('PASS: all eight cards summoned via project composer and sidebar; both project submissions accepted.');
  for (const [name, expected] of [
    ['装卸货地追溯留证','候选装货点：'], ['轨迹造假分析预警','比电子签到晚 51 分钟'],
    ['车机离线监控提醒','离线 21 分钟'], ['异常停靠与偷串货预警','非计划停靠待复核'],
    ['进场车辆核查','转现场复核'], ['同城倒短运单生成与监控','第 3 趟 · 待补卸货记录'],
  ]) {
    await summon(name); await send(); await p.getByText(expected, { exact: false }).last().waitFor();
  }
  await summon('运短骗长核查'); await send();
  await input.fill('为什么？'); await send(); await p.getByText(/核查依据：申报起点/).last().waitFor();
  await p.getByRole('button', { name: /在运单地图查看/ }).last().click();
  await p.waitForURL(/orderId=YD261002/);
  await p.locator('[aria-pressed="true"]').filter({hasText:'装货'}).waitFor();
  await p.waitForFunction(() => document.querySelector('.amap-maps') || document.body.innerText.includes('地图加载失败'), null, {timeout: 30000});
  console.log('Map:', await p.locator('.amap-maps').count(), 'AMap containers');
  await summon('装卸图片核验'); await send(); await p.getByText(/请上传这批运单的装卸照片/).waitFor();
  const image = await p.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 540; c.height = 410; const ctx = c.getContext('2d');
    ctx.fillStyle = '#aaa'; ctx.fillRect(0,0,540,410); ctx.fillStyle = '#23435B';ctx.fillRect(10,12,260,290);
    return c.toDataURL('image/png').split(',')[1];
  });
  const photo = { name: '第一卸点.jpg', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') };
  await select(photoPaths ? photoPaths[0] : photo); await send(); await p.locator('.agent-message img[alt]').last().waitFor();
  await p.getByText(photoPaths ? /地磅上的牵引车/ : /540 × 410 px/).last().waitFor();
  for (const [name, suffix] of [['运短骗长核查','.xlsx'],['装卸图片核验','.xlsx'],['装卸货地追溯留证','.zip']]) {
    await summon(name); await select(name === '装卸图片核验' ? photoPaths ? [photosSheet, ...photoPaths] : [{name:'运输核查.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:await readFile(sample)},photo] : sample);
    await send(); await p.getByRole('button', { name: '查看普通任务 ' + name }).click();
    await btn('下载').click();
    const row = p.getByRole('row').filter({ hasText: name });
    await row.first().waitFor({ timeout: 90000 });
    const [download] = await Promise.all([p.waitForEvent('download'),row.first().getByRole('button',{name:/^下载 /}).click()]);
    const bytes = await readFile(await download.path());
    assert(download.suggestedFilename().endsWith(suffix));
    if (process.env.GUIDE_VERIFIED_OUTPUT) await writeFile(join(process.env.GUIDE_VERIFIED_OUTPUT, 'v267_验收_' + name + suffix),bytes);
    if (suffix === '.zip') {
      const files = unzipSync(bytes), names = Object.keys(files);
      const report = read(files[names.find(k => k.endsWith('.xlsx'))],{type:'array'});
      const results = utils.sheet_to_json(report.Sheets[report.SheetNames[0]]);
      console.log('Evidence ZIP:', names, results.map(x => x.执行结果));
      assert.equal(results.length, 4);
      for (const row of results.filter(r => r.生成图片路径)) assert(files[row.生成图片路径]?.length > 2000);
      if (process.env.REQUIRE_GUIDE_MAP) {
        const jpg = results.find(r => r.运单号 === 'YD261002')?.生成图片路径;
        assert(files[jpg], 'YD261002 must produce a watermarked map image');
        const dimensions = await p.evaluate(async base64 => {
          const im = new Image(); im.src = 'data:image/jpeg;base64,' + base64; await im.decode(); return [im.naturalWidth, im.naturalHeight];
        }, Buffer.from(files[jpg]).toString('base64'));
        assert(dimensions[0] >= 1000 && dimensions[1] >= 600); console.log('Decoded JPEG:', dimensions);
      }
    } else {
      const book = read(bytes); const rows = utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
      if (name === '装卸图片核验' && photoPaths) {
        assert.equal(rows.length, 6); assert(rows.every(r => r.执行状态 === '完成'));
        assert.equal(new Set(rows.map(r => r.画面内容)).size, 6); assert(rows.some(r => r.画面内容.includes('篷布覆盖')));
        console.log('Verified all six supplied images in the downloaded workbook.');
      } else {
        assert(rows.some(r => r.执行状态 === '失败') && rows.some(r => r.执行状态 === '完成'));
        if (name === '装卸图片核验') assert(rows.some(r => String(r.图片信息).includes('540 × 410')));
      }
    }
  }
  await btn('新对话').click(); await p.waitForURL(url => url.pathname === '/index/agent');
  await p.setViewportSize({ width: 390, height: 844 });
  await p.locator('.summon-trigger').click();
  await p.getByRole('searchbox').fill('进场车辆核查');
  await btn('召唤 进场车辆核查').click(); await send();
  await p.getByText('转现场复核', {exact:false}).last().waitFor();
  assert(await p.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log('PASS: eight summoned skills, follow-up, event deep link, uploaded photos, XLSX and ZIP downloads, narrow viewport.');
} finally { await browser.close(); }
