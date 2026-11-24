import { requestClient } from '@/api/request';
// 登录
export const pluginUserLogin = (data: any) =>
  requestClient.post(`/api/pluginuser/login`, {
    data,
    options: {
      noLoading: false,
    },
  });

// 项目列表
export const shuzirenProjectFindPage = (data: any) => requestClient.get(`/api/shuziren/project/findPage`, { data });
// 新增项目
export const shuzirenProjectAdd = (data: any) => requestClient.post(`/api/shuziren/project/add`, { data });
// 编辑项目
export const shuzirenProjectUpdate = (data: any) => requestClient.post(`/api/shuziren/project/edit`, { data });
// 获取详情
export const shuzirenProjectGetById = (data: any) => requestClient.get(`/api/shuziren/project/getById`, { data });
// 获取验证码
export const shuzirenJinyuCaptcha = (data: any) =>
  requestClient.get(`/api/shuziren/jinyu/captcha`, {
    data,
    responseType: 'blob',
    options: {
      noLoading: false,
      responseReturn: 'raw',
    },
  });
// 登录
export const shuzirenJinyuLogin = (data: any) =>
  requestClient.post(`/api/shuziren/jinyu/login`, {
    data,
  });
// 切换运行状态
export const shuzirenProjectToggleRunStatus = (data: any) => requestClient.post(`/api/shuziren/project/toggleRunStatus`, { data });
// 获取项目消息
export const shuzirenProjectFindMessageList = (data: any) => requestClient.get(`/api/shuziren/project/findMessageList`, { data });
// 获取项目今日统计
export const shuzirenProjectTodayStat = (data: any) => requestClient.get(`/api/shuziren/project/todayStat`, { data });

// 获取运单时间
export const getTransportTime = (data: any) => requestClient.post(`/api/track/transport/getTransportTime`, { data });
