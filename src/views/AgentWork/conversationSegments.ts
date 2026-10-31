import type { ChatMessage } from './interface';

export function activeConversationContext(messages: ChatMessage[]) {
  const boundary = messages.findLastIndex((message) => Boolean(message.sessionDivider));
  return messages.slice(boundary + 1);
}
export function conversationBusy(messages: ChatMessage[]) {
  const last = messages.at(-1);
  return Boolean(last && (last.streaming || last.status === '处理中' || last.role === 'user'));
}

export function restoreProjectChats(): Record<string, ChatMessage[]> {
  try {
    const value = JSON.parse(localStorage.getItem('iovagent_project_chats_v1') || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, ChatMessage[]] => Array.isArray(entry[1])).map(([key, messages]) => [key, messages.filter((message) => message && ['user', 'agent'].includes(message.role) && typeof message.text === 'string').map((message) => message.streaming || message.status === '处理中' ? { ...message, streaming: false, status: '已中断', text: '上次输出已中断，请重新提问。' } : message)]));
  } catch { return {}; }
}
export function persistProjectChats(chats: Record<string, ChatMessage[]>) {
  try {
    // Blob downloads belong to the current browser document, not saved history.
    localStorage.setItem('iovagent_project_chats_v1', JSON.stringify(chats, (key, value) => key === 'file' && value?.url?.startsWith('blob:') ? undefined : value));
  } catch { /* In-memory history remains available if local storage is full. */ }
}
