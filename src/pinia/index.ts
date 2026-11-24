import { defineStore } from 'pinia';

export { agentWorkData, quickPrompts, rightPanelTabs } from './agentWork';

export const linglongData = defineStore('linglongData', {
  state: () => {
    return {
      authCode: '',
      clients: null as any,
    };
  },
  actions: {
    changeAuthCode(authCode: string) {
      this.authCode = authCode;
    },
    changeClients(val: any) {
      this.clients = val;
    },
  },
});
