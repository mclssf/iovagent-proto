<script setup lang="ts">
import {ref} from 'vue';import {useRouter} from 'vue-router';import {agentWorkData} from '@/pinia/agentWork';
import {usePhase1} from '@/pinia/phase1';import {dateText} from './catalog';
const minutes=ref(15);const s=usePhase1();const router=useRouter();const work=agentWorkData();
function reset(){s.resetSamples();const p=work.projects.find(p=>p.id==='P001');if(p)work.switchProject(p);router.push('/index/orders');}
function undo(){s.undoReset();router.push('/index/orders');}
</script>
<template><aside class="p1-clock"><span>本地模拟时间 <strong>{{dateText(s.now)}}</strong></span><button @click="s.advance(10)">推进10分钟</button><button @click="s.advance(60)">推进1小时</button><button @click="s.advance(72*60)">推进72小时</button><label>指定分钟<input type="number" min="1" v-model.number="minutes" style="width:68px"/></label><button :disabled="!Number.isInteger(minutes)||minutes<1" @click="s.advance(minutes)">推进指定时间</button><label>接口能力<select v-model="s.capability"><option value="mock">Mock支持</option><option value="whitepaper">白皮书约束</option></select></label><small>仅对新建/重订生效；不调用真实接口</small><button @click="reset">恢复初始样例</button><button v-if="s.lastResetSnapshot" @click="undo">撤销恢复</button></aside></template>
