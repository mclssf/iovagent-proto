import fs from 'node:fs/promises';
import ts from 'typescript';
const source = await fs.readFile('src/views/AgentWork/companyTelemetry.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext }}).outputText;
const { telemetryWindow } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const orders = JSON.parse(await fs.readFile('src/views/AgentWork/customerOrders.json', 'utf8'));
for (const plate of [...new Set(orders.map(o => o.plate))]) {
  const window = telemetryWindow(orders.filter(o => o.plate === plate), process.argv.includes('--recent'));
  const response = await fetch('http://127.0.0.1:5808/api/company-openapi/telemetry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plate, color: '2', ...window }) });
  const r = await response.json();
  console.log(JSON.stringify({ plate, http: response.status, location: !!r.location, reportTime: r.location?.timestamp, trackPoints: r.track?.length, start: r.start, end: r.end, locationError: r.locationError, trackError: r.trackError, error: r.error }));
}
