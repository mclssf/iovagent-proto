import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({channel:'chrome', headless:true});
const page = await browser.newPage({ viewport:{width:1440,height:960} });
page.setDefaultTimeout(7000);
const errors=[];
page.on('pageerror', e=>errors.push(String(e)));
const button = (name) => page.getByRole('button',{name,exact:true});
const text = () => page.locator('textarea:visible').last();
const panel = page.locator('.agent-workspace');
const state = () => page.evaluate(()=>JSON.parse(localStorage.getItem('iovagent:workspace:v1:local')));
const active = async () => {const s=await state();return s.threads.find(t=>t.id===s.last[s.projectId]);};
async function project(name) {
  await button('切换项目').click();
  await page.getByRole('dialog',{name:'切换项目'}).getByRole('button',{name:new RegExp('^'+name)}).click();
}
async function send(value) { await text().fill(value); await button('发送').click(); }
async function checkLegacySidebar() {
  const p=await browser.newPage();
  try {
    await p.addInitScript(()=>{
      const key='iovagent:workspace:v1:local',id='saved-sidebar';
      if(localStorage.getItem(key))return;
      localStorage.setItem(key,JSON.stringify({projectId:'P001',last:{P001:id},migrated:true,
        favorites:[],recent:['P001'],panelOpen:true,threads:[{id,projectId:'P001',title:'原业务会话',updated:1,
          refs:[{kind:'运单',id:'HD-001',label:'HD-001'}],messages:[{role:'agent',text:'上次核验记录'}]}]}));
      const scope=JSON.stringify(['ent-east','project-chat-agent','P001',id]);
      localStorage.setItem(key+':drafts',JSON.stringify({[scope]:{text:'待发送的补充要求',files:[],skillId:'',template:'',automatic:false,revision:1,notice:''}}));
    });
    await p.goto(new URL('/index/orders?projectId=P001',process.env.WORKSPACE_URL || 'http://127.0.0.1:5804').href);
    await p.locator('.order-list-table').waitFor();
    const taskIds=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('iovagent-ordinary-tasks-v2')||'[]').map(t=>t.id));
    const before=await taskIds();
    await p.getByRole('button',{name:'AI 工作台',exact:true}).click();
    await p.getByText('上次核验记录',{exact:true}).waitFor();
    assert.equal(new URL(p.url()).searchParams.get('chat'),'saved-sidebar');
    assert.equal(await p.locator('textarea:visible').last().inputValue(),'待发送的补充要求');
    await p.reload();await p.getByText('上次核验记录',{exact:true}).waitFor();
    assert.deepEqual(await taskIds(),before);
  } finally {await p.close();}
}
async function checkBusinessReturn() {
  const p=await browser.newPage({viewport:{width:1160,height:720}});
  const b=name=>p.getByRole('button',{name,exact:true});
  const table=p.locator('.order-list-table');
  const records=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('iovagent-ordinary-tasks-v2')));
  const thread=()=>p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('iovagent:workspace:v1:local'));return s.threads.find(t=>t.id===s.last[s.projectId]);});
  try {
    await p.goto(new URL('/index/orders?projectId=P001',process.env.WORKSPACE_URL || 'http://127.0.0.1:5804').href);
    await table.waitFor(); assert.equal(await p.locator('.workspace-assistant,.agent-workspace').count(),0);
    const width=await table.evaluate(n=>n.clientWidth);
    const columns=await table.locator('th').allTextContents();
    await b('收起导航').click();assert.ok(await table.evaluate(n=>n.clientWidth)>width+200);
    assert.deepEqual(await table.locator('th').allTextContents(),columns);await b('展开导航').click();
    await p.getByLabel('每页数量').selectOption('5');
    await p.getByTitle('切换开始时间排序').click();await p.getByTitle('切换开始时间排序').click();
    await table.locator('tbody input').first().check();const a=await table.locator('tbody input').first().inputValue();
    await b('下一页').click();
    await table.locator('tbody input').first().check();const z=await table.locator('tbody input').first().inputValue();
    const keyword=p.getByPlaceholder('运单号 / 车牌 / 承运商 / 线路');
    await keyword.fill('没有匹配的运单');
    await p.getByText('已选 2 条运单',{exact:true}).waitFor();assert.equal(await table.locator('tbody input').count(),0);
    const before=await records(), previous=await thread();
    await b('核验异常').click();
    assert.match(p.url(),/orders/);assert.equal((await thread()).messages.length,previous.messages.length);
    const task=(await records()).find(t=>!before.some(old=>old.id===t.id));
    assert.deepEqual(task.scopeRecords.map(o=>o.运单号).sort(),[a,z].sort());assert.ok(!task.conversationId);
    await b('新对话').click();assert.deepEqual((await thread()).refs,[]);
    await b('返回运单列表').click();assert.equal(await keyword.inputValue(),'没有匹配的运单');
    await keyword.fill('');await b('下一页').click();
    const x=await table.evaluate(n=>{n.scrollLeft=64;return n.scrollLeft;});
    await b('交给数字人').click();await b('返回运单列表').waitFor();
    const handoff=await thread();assert.deepEqual(handoff.refs.map(r=>r.id).sort(),[a,z].sort());assert.equal(handoff.messages.length,0);
    await p.reload();await b('返回运单列表').waitFor();assert.equal((await thread()).id,handoff.id);
    await p.goBack();await table.waitFor();
    assert.equal(await p.getByLabel('每页数量').inputValue(),'5');
    await p.getByText('2 / 2',{exact:true}).waitFor();assert.ok(await table.locator('tbody input').first().isChecked());
    assert.ok(await p.getByTitle('切换开始时间排序').innerText().then(v=>v.includes('↑')));
    assert.equal(await table.evaluate(n=>n.scrollLeft),x);
    await p.goForward();await b('返回运单列表').waitFor();
    // Model a data refresh while the user is in the chat. No row-number substitutions are valid.
    await p.evaluate(id=>{
      const store=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('agentWork');
      store.ordersSeed=store.ordersSeed.filter(o=>o.id!==id);
    },a);
    await b('返回运单列表').click();await p.getByText(/已移除 1 条不存在或无权查看的运单/).waitFor();
    await p.getByText('已选 1 条运单',{exact:true}).waitFor();
    assert.deepEqual((await records()).find(t=>t.id===task.id).scopeRecords.map(o=>o.运单号).sort(),[a,z].sort());
    assert.deepEqual((await thread()).refs.map(r=>r.id).sort(),[a,z].sort());
    await b('已提交 · 查看任务').click();
    await p.getByRole('heading',{name:task.name,exact:true}).last().waitFor();
    await b('项目看板').click();await b('新对话').click();await b('新对话').click();await b('返回项目看板').click();
    await p.getByRole('heading',{name:'项目看板'}).waitFor();
  } finally { await p.close(); }
}
try {
  await checkBusinessReturn();
  await checkLegacySidebar();
  await page.addInitScript(()=>{if(!localStorage.getItem('iovagent_project_chats_v1'))
    localStorage.setItem('iovagent_project_chats_v1',JSON.stringify({P001:[{role:'agent',text:'已保存的历史记录'}]}));});
  await page.goto(process.env.WORKSPACE_URL || 'http://127.0.0.1:5804/index/agent');
  await button('选择工作项目').waitFor();
  await project('华东干线在途监控');
  await button('运单列表').click();
  await button('新对话').click();
  await panel.waitFor();
  assert.match(page.url(),/index\/agent/);
  await send('请核对运输业务范围');
  await text().fill('尚未提交的追问');
  const first=await active();
  await button('返回运单列表').click();
  const checks=page.locator('tbody input[type=checkbox]');
  for(let i=0;i<3;i++) await checks.nth(i).check();
  await button(first.title).click();
  assert.equal(await text().inputValue(),'尚未提交的追问');
  assert.equal((await active()).refs.length,0);
  await button('返回运单列表').click();
  await button('交给数字人').click();
  await panel.getByText('已引用 3 条运单').waitFor();
  const draft=await active();assert.notEqual(draft.id,first.id);assert.equal(draft.messages.length,0);
  await send('创建任务：核对所选三票运单');
  await panel.getByText(/已创建普通任务/).waitFor();
  const second=await active(), taskId=second.messages.at(-1).dailyTaskId;
  assert.ok(taskId); assert.equal(second.messages[0].references.length,3);
  await button('返回运单列表').waitFor(); assert.equal((await active()).id,second.id);
  await button('新对话').click();assert.equal((await active()).refs.length,0);
  await send('生成本周运输成本分析报告');
  const pending=await active(); assert.equal(pending.messages.at(-1).status,'处理中');
  await project('冷链城配项目');
  const other=await active();assert.notEqual(other.projectId,first.projectId);
  await text().fill('冷链项目临时草稿');
  await page.waitForFunction(id=>{
    const t=JSON.parse(localStorage.getItem('iovagent:workspace:v1:local')).threads.find(t=>t.id===id);
    return t?.messages.at(-1)?.role==='agent' && !t.messages.at(-1)?.streaming && !['处理中','调用中'].includes(t.messages.at(-1)?.status);
  },pending.id,{timeout:60000});
  assert.deepEqual((await active()).messages,other.messages);
  assert.equal(await text().inputValue(),'冷链项目临时草稿');
  await button('运单列表').click();
  await page.getByPlaceholder('运单号 / 车牌 / 承运商 / 线路').fill('冷链筛选');
  await button('查看全部').click();
  await page.getByLabel('历史项目范围').selectOption('*');
  await page.getByPlaceholder('搜索对话').fill(first.title);
  await page.getByRole('dialog',{name:'对话历史'}).getByRole('button',{name:new RegExp(first.title)}).click();
  assert.equal((await active()).id,first.id); assert.equal(await text().inputValue(),'尚未提交的追问');
  await button('返回冷链城配项目 · 运单列表').click();
  assert.equal(await page.getByPlaceholder('运单号 / 车牌 / 承运商 / 线路').inputValue(),'冷链筛选');
  assert.equal((await state()).projectId,other.projectId);
  await page.goForward();await panel.waitFor();assert.equal((await active()).id,first.id);
  await button('任务').click();
  await page.getByRole('button',{name:/^查看任务 .*三票运单/}).click();
  await button('查看来源对话').click(); assert.equal((await active()).id,second.id);
  await panel.locator('input[type=file]').setInputFiles({name:'独立草稿.txt',mimeType:'text/plain',buffer:Buffer.from('仅供本条对话处理')});
  await panel.getByRole('button',{name:'数字人技能',exact:true}).click();
  await page.getByRole('dialog',{name:'数字人技能'}).getByRole('button',{name:/^召唤 /}).first().click();
  await panel.getByRole('button',{name:'取消召唤'}).waitFor();
  await page.reload();await panel.waitFor();
  await panel.getByRole('button',{name:'删除文件 独立草稿.txt'}).waitFor();
  await panel.getByRole('button',{name:'取消召唤'}).waitFor(); assert.equal((await active()).id,second.id);
  const tasks=await page.evaluate(()=>JSON.parse(localStorage.getItem('iovagent-ordinary-tasks-v2')));
  assert.equal(tasks.filter(t=>t.id===taskId).length,1); assert.equal(tasks.find(t=>t.id===taskId).scopeRecords.length,3);
  assert.ok((await state()).threads.some(t=>t.messages.some(m=>m.text==='已保存的历史记录')));
  await button('返回任务').click();
  const discussion=button(second.title).locator('..');
  await discussion.getByRole('button',{name:'删除对话',exact:true}).click();
  await page.getByRole('button',{name:'删除',exact:true}).last().click();
  assert.ok(!(await state()).threads.some(t=>t.id===second.id));
  await button('追问结果').click();
  const follow=await active(); assert.notEqual(follow.id,second.id); assert.equal(follow.refs[0].id,taskId);
  assert.ok(follow.refs[0].runId);assert.equal(follow.projectId,second.projectId);
  await button('返回任务').click();
  await page.getByLabel('任务查看范围').selectOption('unlinked');
  await page.getByLabel('任务类型',{exact:true}).selectOption('scheduled');
  await page.getByRole('button',{name:'查看任务 每日异常报告'}).click();
  await page.getByText('7 月 23 日在途异常风险报告',{exact:false}).last().waitFor();
  await page.getByLabel('任务查看范围').selectOption('current');
  await page.getByLabel('任务类型',{exact:true}).selectOption('all');
  await button('新建任务').first().click();
  await send('每天下午6点汇总运输情况');
  await panel.getByText(/已安排每日任务/).waitFor();
  const recurrent=(await active()).messages.at(-1).dailyTaskId;
  assert.ok(recurrent);
  await button('返回任务').click();
  await page.getByLabel('任务类型',{exact:true}).selectOption('scheduled');
  const scheduledCard=page.getByRole('button',{name:/查看任务.*每天下午6点/}).locator('..');
  await scheduledCard.getByRole('button',{name:'暂停任务'}).click();
  await scheduledCard.getByRole('button',{name:'恢复任务'}).click();
  assert.equal(await page.evaluate(id=>JSON.parse(localStorage.getItem('iovagent-ordinary-tasks-v2')).find(t=>t.id===id).schedule.time,recurrent),'18:00');
  await button('异常运单').click();
  await page.locator('tbody input[type=checkbox]').first().check();
  await button('交给数字人').click();
  await send('分析异常依据');
  await panel.getByRole('button',{name:(await active()).refs[0].label,exact:true}).first().click();
  await page.getByRole('heading',{name:'运单详情',exact:true}).waitFor();
  await project('冷链城配项目');await page.waitForURL(/orders.*projectId=P002/);
  await button('任务').click();
  assert.equal(await page.getByRole('button',{name:/查看任务.*每天下午6点/}).count(),0);
  await page.setViewportSize({width:390,height:844});
  await button('展开导航').click();await button('新对话').click();await panel.waitFor();
  const sendBox=await button('发送').boundingBox();assert.ok(sendBox && sendBox.x>=0 && sendBox.x+sendBox.width<=391);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.deepEqual(errors,[]);console.log('Passed: project isolation, independent chats/drafts, handoff, task source & scope, background reply, history, reload, migration, narrow layout.');
} finally { await browser.close(); }
