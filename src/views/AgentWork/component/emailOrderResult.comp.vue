<script lang="ts" setup>
import type { EmailOrderResult } from '../interface';
import { formatTaskTime } from '../dailyTasks';

defineProps<{ email: EmailOrderResult }>();
</script>

<template>
  <div class="email-result">
    <details class="email-details email-message">
      <summary>查看原始邮件</summary>
      <dl class="email-message-meta"><div><dt>发件人</dt><dd>{{ email.senderName }} &lt;{{ email.sender }}&gt;</dd></div><div><dt>收件人</dt><dd>{{ email.mailbox }}</dd></div><div><dt>收件时间</dt><dd>{{ formatTaskTime(email.receivedAt) }}</dd></div><div><dt>主题</dt><dd>{{ email.subject }}</dd></div></dl>
      <p class="email-body">{{ email.originalBody }}</p>
    </details>
    <details class="email-details email-message" open>
      <summary>查看回复邮件<span v-if="email.reply.sentAt">{{ formatTaskTime(email.reply.sentAt) }} 已回复</span></summary>
      <dl class="email-message-meta"><div><dt>发件人</dt><dd>{{ email.mailbox }}</dd></div><div><dt>收件人</dt><dd>{{ email.sender }}</dd></div><div><dt>主题</dt><dd>{{ email.reply.subject }}</dd></div></dl>
      <p class="email-body">{{ email.reply.body }}</p>
    </details>
  </div>
</template>
