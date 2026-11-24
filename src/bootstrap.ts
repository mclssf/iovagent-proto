import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import { handleRouter } from './router';

import './styles/tailwind.css';
import 'animate.css';

async function bootstrap(_namespace = 'iovagent') {
  const app = createApp(App);
  const router = handleRouter([]);

  app.use(createPinia());
  app.use(router);
  app.mount('#app');
}

export { bootstrap };
