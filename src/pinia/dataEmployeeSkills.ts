export const dataEmployeeSkillGroup = '数据员工 Skill' as const;

export type LoginType = '短信验证码' | '手机扫码' | '图形验证码' | '无验证';
export interface WechatEmployeeSource {
  enterpriseId: string;
  enterpriseName: string;
  accountId: string;
  accountName: string;
  wechatId: string;
  groupId: string;
  groupName: string;
  onlineStatus: 'online' | 'offline';
  acquisitionMethod: string;
  recognitionDescription: string;
}
export interface DataEmployeeSkill {
  description: string;
  privateToolIds: string[];
  id: string;
  loginType: LoginType;
  loginUrl: string;
  name: string;
  skillContent: string;
  skillFileName: string;
  skillUpdated: string;
  skillVersion: string;
  group: typeof dataEmployeeSkillGroup;
  sourceType?: 'wechat';
  wechatSource?: WechatEmployeeSource;
}

// The front-end demo has no authenticated enterprise ID; keep this scope explicit.
export const currentWechatEnterpriseId = 'ent-east';

export function filterDataEmployeeSkillsForEnterprise(skills: readonly DataEmployeeSkill[], enterpriseId = currentWechatEnterpriseId): DataEmployeeSkill[] {
  return skills.filter((skill) => skill.sourceType !== 'wechat' || skill.wechatSource?.enterpriseId === enterpriseId);
}

/** Local fixtures only: account status and bindings do not call a WeChat service. */
export function createWechatDataEmployeeSkills(): DataEmployeeSkill[] {
  const accounts: Record<string, Pick<WechatEmployeeSource, 'enterpriseId' | 'enterpriseName' | 'accountId' | 'accountName' | 'wechatId' | 'onlineStatus'>> = {
    'wx-east-dispatch': { enterpriseId: 'ent-east', enterpriseName: '华东物流事业部', accountId: 'wx-east-dispatch', accountName: '华东调度', wechatId: 'dk_hd_dispatch', onlineStatus: 'online' },
    'wx-east-retail': { enterpriseId: 'ent-east', enterpriseName: '华东物流事业部', accountId: 'wx-east-retail', accountName: '商超配送', wechatId: 'dk_retail_service', onlineStatus: 'offline' },
    'wx-southwest-dispatch': { enterpriseId: 'ent-southwest', enterpriseName: '西南供应链中心', accountId: 'wx-southwest-dispatch', accountName: '西南调度', wechatId: 'dk_xn_dispatch', onlineStatus: 'online' },
  };
  const bindings = [
    { id: 'wechat-east-city-dispatch', accountId: 'wx-east-dispatch', groupId: 'wxg-east-city', groupName: '华东城配调度群' },
    { id: 'wechat-east-linehaul', accountId: 'wx-east-dispatch', groupId: 'wxg-east-linehaul', groupName: '苏沪干线发运群' },
    { id: 'wechat-east-retail', accountId: 'wx-east-retail', groupId: 'wxg-east-retail', groupName: '华南商超配送群' },
    { id: 'wechat-southwest-dispatch', accountId: 'wx-southwest-dispatch', groupId: 'wxg-southwest-dispatch', groupName: '西南区域调度群' },
  ];
  const recognitionDescription = '识别绑定微信群中的运输委托和运单消息，结合消息上下文提取已提供的运单号、装货地、卸货地、货物名称与数量、装卸货时间、车牌、司机和联系人等信息，整理为项目运单；保留消息来源，未提供的字段留空，不推测补写。';
  return bindings.map(({ id, accountId, groupId, groupName }) => {
    const wechatSource: WechatEmployeeSource = { ...accounts[accountId]!, groupId, groupName, acquisitionMethod: '微信消息', recognitionDescription };
    return {
      id,
      name: '群消息录单员',
      description: `从「${groupName}」获取微信消息，识别运输委托并提取运单信息。`,
      group: dataEmployeeSkillGroup,
      privateToolIds: [],
      sourceType: 'wechat' as const,
      wechatSource,
      loginType: '无验证' as const,
      loginUrl: '微信群消息',
      skillVersion: 'v1.0',
      skillUpdated: '2026-10-21 10:00',
      skillFileName: `${id}.skill.md`,
      skillContent: `# 群消息录单员\n\n数据获取方式：${wechatSource.acquisitionMethod}\n绑定微信群：${groupName}\n\n识别方式：${recognitionDescription}\n\n处理规则：\n1. 仅处理当前企业、绑定微信号及微信群范围内的消息。\n2. 每个录单员对应一个微信号和一个微信群，同一微信号的不同群分别配置。\n3. 将消息中已有的信息映射为标准运单字段，保留来源群和原始消息引用。\n4. 微信号离线时暂停获取新消息，保留已有绑定和项目配置。`,
    };
  });
}

export function createDataEmployeeSkills(): DataEmployeeSkill[] {
  return [
    {
      id: 'jinyu-cement-tms',
      group: dataEmployeeSkillGroup,
      privateToolIds: [],
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
      group: dataEmployeeSkillGroup,
      privateToolIds: [],
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
      group: dataEmployeeSkillGroup,
      privateToolIds: [],
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
      group: dataEmployeeSkillGroup,
      privateToolIds: [],
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
      group: dataEmployeeSkillGroup,
      privateToolIds: [],
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
    {
      group: dataEmployeeSkillGroup,
      privateToolIds: [],
      id: 'huadong-dispatch-writeback',
      name: '华东派车回写员工',
      description: '将确认合作的司机、车辆和报价回写客户业务系统，完成指派并触发平台货源下架。',
      loginUrl: 'https://tms.huadong.example.com',
      loginType: '短信验证码',
      skillVersion: 'v1.0',
      skillUpdated: '今天 11:32',
      skillFileName: 'huadong-dispatch-writeback.skill.md',
      skillContent: `# 华东派车回写员工

目标：将数字人确认的司机和车辆写回客户业务系统。

执行规则：
1. 校验货源仍可派车且司机、车辆字段完整。
2. 回写司机、手机号、车牌、车型、车长、成交价和来源平台。
3. 记录外部指派结果；成功后将标准货源置为已派车。
4. 触发大卡与满帮货源同步下架；失败时保留重试状态，不得重复指派。`,
    },
    {
      group: dataEmployeeSkillGroup,
      privateToolIds: [],
      id: 'huadong-cargo-connector',
      name: '华东货源对接员工',
      description: '从客户业务系统抓取待外调货源，映射标准字段，并持续监听修改、取消和派车状态。',
      loginUrl: 'https://tms.huadong.example.com',
      loginType: '短信验证码',
      skillVersion: 'v1.0',
      skillUpdated: '今天 11:30',
      skillFileName: 'huadong-cargo-connector.skill.md',
      skillContent: `# 华东货源对接员工

目标：从客户发运系统识别需要外调运力的货源，映射到标准货源模型。

同步规则：
1. 首次抓取货物、装卸地、时效、车型车长、价格策略和调度员。
2. 监听源货源修改、取消、派车完成等状态。
3. 已发布货源发生变化时，触发统一发布能力执行修改或下架。
4. 保留源系统货源号与原始数据引用，支持幂等同步和问题追溯。`,
    },
    ...createWechatDataEmployeeSkills(),
  ];
}
