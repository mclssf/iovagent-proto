import { requestClient } from '@/api/request';
// 登录
export const pluginUserLogin = (data: any) =>
  requestClient.post(`/api/pluginuser/login`, {
    data,
    options: {
      noLoading: false,
    },
  });

// 获取用户信息
export const pluginUserGetLoginUser = (data: any) => requestClient.post(`/api/pluginuser/getLoginUser`, { data });
// 获取菜单
export const pluginUserMenuGetUserMenuList = (data: any) => requestClient.post(`/api/pluginuser/menu/getUserMenuList`, { data });
// 获取按钮权限
export const pluginUserMenuListUserBtnPermission = (data: any) => requestClient.post(`/api/pluginuser/menu/listUserBtnPermission`, { data });
// 获取验证码
export const pluginuserSmsVerify = (data: any) =>
  requestClient.post(`/api/pluginuser/smsVerify`, {
    data,
  });
