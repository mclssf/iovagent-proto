import type { SkillVisibility } from './agentOps';

export type LoginType = '短信验证码' | '手机扫码' | '图形验证码' | '无验证';
export interface DataEmployeeSkill {
  description: string;
  enterpriseIds: string[];
  id: string;
  loginType: LoginType;
  loginUrl: string;
  name: string;
  skillContent: string;
  skillFileName: string;
  skillUpdated: string;
  skillVersion: string;
  visibility: SkillVisibility;
}

export function createDataEmployeeSkills(): DataEmployeeSkill[] {
  return [
    {
      id: 'jinyu-cement-tms',
      visibility: '指定企业',
      enterpriseIds: ['ent-jinyu'],
      name: '金隅水泥TMS',
      description: '面向金隅水泥运输业务的 TMS 数据采集与运单映射 Skill。',
      loginUrl: 'https://tms.jinyu.demo/login',
      loginType: '图形验证码',
      skillVersion: 'v1.3',
      skillUpdated: '今天 09:40',
      skillFileName: 'jinyu-waybill-mapping.skill.md',
      skillContent: `# 金隅水泥TMS 运单映射 Skill

目标：进入“运输管理 / 在途运单”页面，抓取今日在途运单明细。

页面导航：
1. 登录后进入【运输管理】。
2. 打开【运单查询】并筛选状态=在途。
3. 展开列表字段：运单号、车牌、承运商、起运地、目的地、发车时间、预计到达时间。

语义映射：
- 运单编号 -> waybill_no
- 车牌号码 -> vehicle_plate
- 承运单位 -> carrier_name
- 起运工厂 -> origin_name
- 收货仓库 -> destination_name
- 运输状态 -> order_status`,
    },
    {
      id: 'zhilian-shunda-tms',
      visibility: '指定企业',
      enterpriseIds: ['ent-zhilian'],
      name: '智链顺达TMS',
      description: '负责从智链顺达调度中心抓取执行中运输任务。',
      loginUrl: 'https://tms.zhilian-shunda.demo/login',
      loginType: '短信验证码',
      skillVersion: 'v1.1',
      skillUpdated: '昨天 18:20',
      skillFileName: 'zhilian-waybill-mapping.skill.md',
      skillContent: `# 智链顺达TMS 运单映射 Skill

目标：从“调度中心 / 执行中任务”抓取执行中运单。

页面导航：
1. 使用账号和短信验证码登录。
2. 进入【调度中心】。
3. 打开【执行中任务】，按更新时间倒序抓取。

语义映射：
- 任务单号 -> waybill_no
- 司机车辆 -> vehicle_plate
- 物流商 -> carrier_name
- 装货点 -> origin_name
- 卸货点 -> destination_name
- 最新定位 -> current_location`,
    },
    {
      id: 'jinmailang-logistics',
      visibility: '指定企业',
      enterpriseIds: ['ent-jinmailang'],
      name: '今麦郎物流管理',
      description: '面向今麦郎发运看板和运单列表的数据采集 Skill。',
      loginUrl: 'https://logistics.jinmailang.demo/login',
      loginType: '无验证',
      skillVersion: 'v1.0',
      skillUpdated: '06-24 15:12',
      skillFileName: 'jinmailang-waybill-mapping.skill.md',
      skillContent: `# 今麦郎物流管理 运单映射 Skill

目标：从“发运看板 / 运单列表”抓取发运和在途数据。

页面导航：
1. 登录后进入【发运看板】。
2. 切换到【运单列表】。
3. 抓取列表和详情弹窗中的线路、货品、状态、异常标记。

语义映射：
- 发运单号 -> waybill_no
- 线路名称 -> route_name
- 货品名称 -> cargo_name
- 当前节点 -> order_status
- 异常标签 -> abnormal_type`,
    },
    {
      id: 'spreadsheet-waybill',
      visibility: '全部企业',
      enterpriseIds: [],
      name: '表格运单',
      description: '用于上传表格运单并映射为标准运单数据集。',
      loginUrl: '本地表格导入',
      loginType: '无验证',
      skillVersion: 'v1.2',
      skillUpdated: '06-23 11:08',
      skillFileName: 'spreadsheet-waybill-mapping.skill.md',
      skillContent: `# 表格运单映射 Skill

目标：将客户上传的 Excel / CSV 运单表映射为标准运单数据集。

读取规则：
1. 第一行默认为表头。
2. 自动识别运单号、车牌、司机、承运商、线路、起止点、时间字段。
3. 若存在多个候选字段，优先选择包含“运单”“车牌”“起运”“目的”“状态”的中文表头。

语义映射：
- 运单号 / 单号 / 任务号 -> waybill_no
- 车牌 / 车辆 -> vehicle_plate
- 司机 / 驾驶员 -> driver_name
- 承运商 / 物流商 -> carrier_name`,
    },
    {
      id: 'scan-login-tms',
      visibility: '全部企业',
      enterpriseIds: [],
      name: '扫码登录TMS',
      description: '通过手机扫码登录 TMS，抓取并映射在途运单列表的 Skill。',
      loginUrl: 'https://tms.scan-login.demo/login',
      loginType: '手机扫码',
      skillVersion: 'v1.0',
      skillUpdated: '刚刚',
      skillFileName: 'scan-login-waybill-mapping.skill.md',
      skillContent: `# 扫码登录TMS 运单映射 Skill

目标：使用手机扫码登录目标 TMS，进入在途运单页面并抓取运单明细。

页面导航：
1. 打开登录页，等待二维码渲染完成。
2. 用户使用手机端扫码确认登录。
3. 登录成功后进入【在途监控 / 运单列表】。
4. 抓取第一屏运单字段并进入详情页补充轨迹和状态字段。

语义映射：
- 运单号 -> waybill_no
- 车牌 -> vehicle_plate
- 司机 -> driver_name
- 承运商 -> carrier_name
- 当前位置 -> current_location
- 运单状态 -> order_status`,
    },
  ];
}
