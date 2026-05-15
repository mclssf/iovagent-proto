import { defineStore } from 'pinia';

export const useShuzirenSystemStore = defineStore('shuzirenSystem', {
  state: () => {
    return {
      pageLoading: false,
    };
  },
  actions: {
    changePageLoading(loading: boolean) {
      this.pageLoading = loading;
    },
  },
});
