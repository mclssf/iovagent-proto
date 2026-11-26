import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const base=new URL(process.env.WORKSPACE_URL || 'http://127.0.0.1:5804').origin;
const context=await browser.newContext({viewport:{width:1340,height:850}});
const errors=[];
context.on('page',p=>{p.setDefaultTimeout(8000);p.on('pageerror',e=>errors.push(String(e)));});
const p=await context.newPage();
const b=(p,name)=>p.getByRole('button',{name,exact:true});
const receipt=p=>p.evaluate(()=>history.state?.returnReceipt);
const key=p=>p.evaluate(()=>navigation.currentEntry.key);
const keyword=p=>p.getByPlaceholder('运单号 / 车牌 / 承运商 / 线路');
const active=p=>p.evaluate(()=>{
  const ws=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('workspace');
  return JSON.parse(JSON.stringify(ws.active));
});
async function choose(p,name){
  await b(p,'切换项目').click();
  await p.getByRole('dialog',{name:'切换项目'}).getByRole('button',{name:new RegExp('^'+name)}).click();
}
try{
  await p.goto(base+'/index/orders?projectId=P001');
  await p.locator('tbody input').first().check();
  const order=await p.locator('tbody input').first().inputValue();
  await keyword(p).fill(order);
  await b(p,'交给数字人').click();
  await b(p,'返回运单列表').waitFor();
  const A=await receipt(p), C=await active(p);
  assert.equal(A.entryType,'交给数字人');assert.equal(C.createdFrom.page,'agent-work-orders');
  await p.locator('textarea:visible').last().fill('创建任务：核对所选运单');
  await b(p,'发送').click();
  const card=p.getByRole('button',{name:/查看普通任务/});
  await card.waitFor();const title=(await active(p)).title;
  await b(p,'新对话').click();assert.equal((await receipt(p)).id,A.id);
  await b(p,title).click();assert.equal((await active(p)).id,C.id);
  await choose(p,'冷链城配项目');await b(p,'返回华东干线在途监控 · 运单列表').waitFor();
  assert.equal((await receipt(p)).id,A.id);assert.deepEqual((await active(p)).refs,[]);
  await p.goBack();await card.waitFor();assert.equal((await active(p)).id,C.id);
  const oldURL=p.url();
  await p.locator('textarea:visible').last().fill('保留未发送的问题');
  await card.click();await b(p,'追问结果').click();await b(p,'返回任务').waitFor();
  const B=await receipt(p),reopened=await active(p);
  assert.notEqual(A.id,B.id);assert.equal(B.entryType,'追问结果');assert.equal(reopened.id,C.id);
  assert.deepEqual(reopened.createdFrom,C.createdFrom);
  assert.equal(await p.locator('textarea:visible').last().inputValue(),'保留未发送的问题');
  await p.goBack();await b(p,'追问结果').waitFor();await p.goBack();await card.waitFor();
  assert.equal((await receipt(p)).id,A.id);
  await p.goForward();await p.goForward();await b(p,'返回任务').waitFor();
  assert.equal((await receipt(p)).id,B.id);

  // The opener copies sessionStorage. Neither a pasted URL nor its origin query authenticates an entry.
  const opened=context.waitForEvent('page');
  await p.evaluate(url=>window.open(url),oldURL+'&origin='+A.id);
  const q=await opened;await q.locator('.agent-workspace').waitFor();
  assert.equal(await q.getByRole('button',{name:/^返回(运单列表|任务)$/}).count(),0);
  assert.equal((await active(q)).id,C.id);
  await b(q,'运单列表').click();await keyword(q).fill('另一标签页');
  await b(q,title).click();await b(q,'返回运单列表').waitFor();
  assert.notEqual((await receipt(q)).id,A.id);
  assert.equal((await receipt(p)).id,B.id);
  await q.locator('textarea:visible').last().fill('核对这次任务的输出范围');
  await b(q,'发送').click();
  await p.getByText('核对这次任务的输出范围',{exact:true}).first().waitFor();
  assert.equal((await receipt(p)).id,B.id);
  await b(q,'返回运单列表').click();assert.equal(await keyword(q).inputValue(),'另一标签页');

  // Reload deliberately loses traversal authority. Replace precisely this AI entry, without pushing.
  await p.reload();await b(p,'返回任务').waitFor();
  const beforeKey=await key(p);
  await b(p,'返回任务').click();await b(p,'追问结果').waitFor();assert.equal(await key(p),beforeKey);
  await p.goBack();await b(p,'追问结果').waitFor();await p.goBack();await b(p,'返回运单列表').waitFor();
  assert.equal((await receipt(p)).id,A.id);
  await b(p,'返回运单列表').click();assert.equal(await keyword(p).inputValue(),order);
  assert.ok(await p.locator('tbody input').first().isChecked());

  // Replace the source entry, preserving its forward AI item. Its key/location alone isn't proof.
  await b(p,'新对话').click();await b(p,'返回运单列表').waitFor();
  const oldKey=await key(p);
  await p.goBack();await keyword(p).waitFor();
  await p.evaluate(()=>document.querySelector('#app').__vue_app__.config.globalProperties.$router.replace('/index/analytics?projectId=P001'));
  await p.getByRole('heading',{name:'项目看板'}).waitFor();
  await p.goForward();await b(p,'返回运单列表').waitFor();
  assert.equal(await key(p),oldKey);
  await b(p,'返回运单列表').evaluate(el=>{el.click();el.click();});
  assert.equal(await keyword(p).inputValue(),order);assert.equal(await key(p),oldKey);

  // Invalidate an object in project A while viewing project B. Do not inspect B's orders instead.
  await b(p,'查看详情').first().click();await p.getByRole('heading',{name:'运单详情',exact:true}).waitFor();
  await b(p,'新对话').click();await b(p,'返回运单详情').waitFor();
  await choose(p,'冷链城配项目');
  await p.evaluate(id=>{
    const w=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('agentWork');
    w.ordersSeed=w.ordersSeed.filter(o=>o.id!==id);
  },order);
  await b(p,'前往华东干线在途监控 · 运单列表').click();
  await keyword(p).waitFor();assert.match(p.url(),/orders\?projectId=P001/);
  await p.getByText(/原运单详情已不可用/).waitFor();
  await b(p,'我发布的货源').click();await p.waitForURL(/cargo-sources/);
  await b(p,'新对话').click();await b(p,'返回我发布的货源').waitFor();
  await p.evaluate(()=>{
    const w=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('agentWork');
    w.projects.find(p=>p.id==='P001').skillIds=[];
  });
  await b(p,'前往华东干线在途监控 · 项目看板').click();await p.getByRole('heading',{name:'项目看板'}).waitFor();
  await b(p,'新对话').click();await choose(p,'冷链城配项目');
  await p.evaluate(()=>{
    const w=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('agentWork');
    w.projects=w.projects.filter(p=>p.id!=='P001');
  });
  await b(p,'选择可访问项目').click();await p.getByRole('dialog',{name:'切换项目'}).waitFor();
  assert.equal((await active(p)).projectId,'P002');
  assert.deepEqual(errors,[]);
  console.log('PASS: independent entries, provenance, AI flow, cross-project, native history, two tabs, direct URL, snapshot replacement and unavailable source fallbacks.');
}catch(error){
  console.error('Route:',p.url(),'return:',await receipt(p),'buttons:',await p.getByRole('button',{name:/^(返回|前往|选择可访问项目)/}).allTextContents());throw error;
}finally{await browser.close();}
