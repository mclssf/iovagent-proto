import { requestClient } from '@/api/request';

// iot车辆轨迹
export const transportGetTransLineInfo = (data: any) => requestClient.post(`/api/track/transport/getTransLineInfo`, { data });

export const pluginuserdingtalksign = (data: any) => requestClient.post(`/api/pluginuser/dingtalk/sign`, { data });

export const pluginuserdingtalkgetUserInfo = (data: any, options?: any) =>
  requestClient.post(`/api/pluginuser/dingtalk/getUserInfo`, {
    data,
    options,
  });

export const pluginuserLogin = (data: any, options?: any) =>
  requestClient.post(`/api/pluginuser/login`, {
    data,
    options,
  });

export const nodeServiceGetOssConfig = (data: any, options?: any) =>
  requestClient.post(`/api/nodeService/getOssConfig`, {
    data,
    options,
  });
