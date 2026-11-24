async function initApplication() {
  const env = import.meta.env.PROD ? 'prod' : 'dev';
  const appVersion = import.meta.env.VITE_APP_VERSION;
  const namespace = `${import.meta.env.VITE_APP_NAMESPACE}-${appVersion}-${env}`;
  // 启动应用并挂载
  const { bootstrap } = await import('./bootstrap');
  await bootstrap(namespace);
}

initApplication();
