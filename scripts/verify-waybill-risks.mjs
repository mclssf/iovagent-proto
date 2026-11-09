import fs from 'node:fs/promises';
const orders=JSON.parse(await fs.readFile('src/views/AgentWork/customerOrders.json','utf8'));
for(const order of orders){
 const response=await fetch('http://127.0.0.1:5808/api/company-openapi/risk-check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId:order.id,color:'2'})});
 const result=await response.json();
 console.log(JSON.stringify({orderId:order.id,http:response.status,risk:result.risk,items:result.items?.map(i=>({name:i.name,status:i.status})),error:result.error}));
}
