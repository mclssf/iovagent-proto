<script lang="ts" setup>
import { computed } from 'vue';
import type { EmailOrderResult } from '../interface';
import { emailTimeRange } from '../emailOrderDemo';
import { formatTaskTime } from '../dailyTasks';

const props = defineProps<{ email: EmailOrderResult }>();
const totalQuantity = computed(() => {
  const quantities = new Map<string, number>();
  for (const item of props.email.order.cargo) quantities.set(item.unit, (quantities.get(item.unit) ?? 0) + item.quantity);
  return [...quantities].map(([unit, quantity]) => `${quantity} ${unit}`).join('、');
});
</script>

<template>
  <div class="email-result">
    <dl class="email-order-fields">
      <div><dt>订单号</dt><dd>{{ email.order.number ?? '未提供' }}</dd></div>
      <div><dt>客户</dt><dd>{{ email.senderName }}</dd></div>
      <div class="email-full"><dt>装货地</dt><dd>{{ email.order.origin }}</dd></div>
      <div class="email-full"><dt>卸货地</dt><dd>{{ email.order.destination }}</dd></div>
    </dl>

    <table class="email-cargo">
      <caption>货物清单</caption>
      <thead><tr><th scope="col">货物</th><th scope="col">数量</th><th scope="col">重量</th><th scope="col">体积</th></tr></thead>
      <tbody><tr v-for="item in email.order.cargo" :key="item.name"><td>{{ item.name }}</td><td>{{ item.quantity }} {{ item.unit }}</td><td>{{ item.weight }} 吨</td><td>{{ item.volume }} m³</td></tr></tbody>
      <tfoot><tr><td>合计</td><td>{{ totalQuantity }}</td><td>{{ email.dispatch.totalWeight }} 吨</td><td>{{ email.dispatch.totalVolume }} m³</td></tr></tfoot>
    </table>
    <p class="email-note">{{ email.order.handling }}</p>

    <section class="email-assessment" aria-label="用车与车源判断">
      <h3>拟安排 {{ email.dispatch.count }} 辆{{ email.dispatch.vehicle }}</h3>
      <p>{{ email.dispatch.allocation }}</p>
      <dl class="email-market">
        <div><dt>附近车源</dt><dd>{{ email.market.supply }} · {{ email.market.availableCount }} 辆 / {{ email.market.radius }} 公里内</dd></div>
        <div><dt>找车难度</dt><dd>{{ email.market.difficulty }}</dd></div>
        <div><dt>预计运价</dt><dd>{{ email.market.price }}</dd></div>
      </dl>
      <details class="email-details"><summary>查看用车与运价依据</summary><p>{{ email.dispatch.reason }}</p><p>{{ email.market.supplyReason }}</p><p>与相近线路、相同车型近期常规时段运价比较。{{ email.market.priceReason }}</p></details>
    </section>

    <section class="email-timing" aria-label="装货与到达安排">
      <h3>时间安排</h3>
      <dl class="email-order-fields">
        <div><dt>装货 · {{ email.timing.loadingSource }}</dt><dd>{{ emailTimeRange(email.timing.loadingStart, email.timing.loadingEnd) }}</dd><small v-if="!email.order.loadingTime">客户未提供装货时间</small></div>
        <div><dt>到达 · {{ email.timing.arrivalSource }}</dt><dd>{{ email.timing.arrivalSource === '客户要求' ? email.order.arrivalRequirement : emailTimeRange(email.timing.arrivalStart, email.timing.arrivalEnd) }}</dd><small v-if="!email.order.arrivalRequirement">客户未提供到达要求</small><small v-else-if="email.timing.arrivalSource === '预计安排'">客户要求：{{ email.order.arrivalRequirement }}</small></div>
      </dl>
      <p v-if="email.timing.latestLoadingAt" class="email-latest">最晚 {{ formatTaskTime(email.timing.latestLoadingAt) }} 开始装货</p>
      <p class="email-note">{{ email.timing.basis }}</p>
    </section>

    <details class="email-details email-message">
      <summary>查看原始邮件</summary>
      <dl class="email-message-meta"><div><dt>发件人</dt><dd>{{ email.senderName }} &lt;{{ email.sender }}&gt;</dd></div><div><dt>收件人</dt><dd>{{ email.mailbox }}</dd></div><div><dt>收件时间</dt><dd>{{ formatTaskTime(email.receivedAt) }}</dd></div><div><dt>主题</dt><dd>{{ email.subject }}</dd></div></dl>
      <p class="email-body">{{ email.originalBody }}</p>
    </details>
    <details class="email-details email-message">
      <summary>查看回复邮件<span v-if="email.reply.sentAt">{{ formatTaskTime(email.reply.sentAt) }} 已回复</span></summary>
      <dl class="email-message-meta"><div><dt>发件人</dt><dd>{{ email.mailbox }}</dd></div><div><dt>收件人</dt><dd>{{ email.sender }}</dd></div><div><dt>主题</dt><dd>{{ email.reply.subject }}</dd></div></dl>
      <p class="email-body">{{ email.reply.body }}</p>
    </details>
  </div>
</template>
