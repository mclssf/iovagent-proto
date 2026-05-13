import { defineComponent, h, type Component } from 'vue';
import {
  AlertOutlined,
  BarChartOutlined,
  CloudDownloadOutlined,
  FileTextOutlined,
  FilterOutlined,
  LoginOutlined,
  LogoutOutlined,
  MessageOutlined,
  PlusOutlined,
  ReloadOutlined,
  RobotOutlined,
  SearchOutlined,
  SettingOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UserOutlined
} from '@ant-design/icons-vue';

type IconName =
  | 'alert'
  | 'analytics'
  | 'download'
  | 'file'
  | 'filter'
  | 'login'
  | 'logout'
  | 'message'
  | 'plus'
  | 'refresh'
  | 'robot'
  | 'search'
  | 'settings'
  | 'shield'
  | 'team'
  | 'user'
  | 'truck'
  | 'map'
  | 'timeline'
  | 'factory'
  | 'route'
  | 'gps';

const antdIcons: Partial<Record<IconName, Component>> = {
  alert: AlertOutlined,
  analytics: BarChartOutlined,
  download: CloudDownloadOutlined,
  file: FileTextOutlined,
  filter: FilterOutlined,
  login: LoginOutlined,
  logout: LogoutOutlined,
  message: MessageOutlined,
  plus: PlusOutlined,
  refresh: ReloadOutlined,
  robot: RobotOutlined,
  search: SearchOutlined,
  settings: SettingOutlined,
  shield: SafetyCertificateOutlined,
  team: TeamOutlined,
  user: UserOutlined
};

const materialPaths: Partial<Record<IconName, string>> = {
  truck:
    'M20 8h-3V4H3c-1.1 0-2 .9-2 2v10h2a3 3 0 1 0 6 0h6a3 3 0 1 0 6 0h2v-4l-3-4ZM6 17.5A1.5 1.5 0 1 1 6 14.5a1.5 1.5 0 0 1 0 3Zm12 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM17 10V6.5h2.2L21 10h-4Z',
  map:
    'M20.5 3 20.3 3 15 5.1 9 3 3.4 4.9c-.2.1-.4.3-.4.6V21l6-2.3 6 2.1 5.6-1.9c.2-.1.4-.3.4-.6V3.5c0-.3-.2-.5-.5-.5ZM10 5.5l4 1.4v11.6l-4-1.4V5.5Zm-5 1 3-1v11.6l-3 1.1V6.5Zm14 10.9-3 1V6.9l3-1.2v11.7Z',
  timeline:
    'M4 5h4v2H6v10h2v2H4V5Zm7 0h9v2h-9V5Zm0 6h9v2h-9v-2Zm0 6h9v2h-9v-2Z',
  factory:
    'M3 21V9l6 4V9l6 4h6v8H3Zm2-2h3v-4H5v4Zm5 0h3v-4h-3v4Zm5 0h4v-4h-4v4ZM3 7h6V3H3v4Z',
  route:
    'M7 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0 4a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm10 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0 4a1 1 0 1 1 0-2 1 1 0 0 1 0 2ZM8 13h5a2 2 0 1 0 0-4h-1V7h1a4 4 0 1 1 0 8H8a2 2 0 1 0 0 4h2v2H8a4 4 0 1 1 0-8Z',
  gps:
    'M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z'
};

export const AppIcon = defineComponent({
  name: 'AppIcon',
  props: {
    name: { type: String, required: true },
    size: { type: Number, default: 18 },
    source: { type: String, default: 'auto' }
  },
  setup(props) {
    return () => {
      const iconName = props.name as IconName;
      const IconComponent = antdIcons[iconName];
      if (IconComponent) {
        return h(IconComponent, {
          style: { fontSize: `${props.size}px`, lineHeight: 1 }
        });
      }

      const path = materialPaths[iconName] || materialPaths.truck;
      return h(
        'svg',
        {
          width: props.size,
          height: props.size,
          viewBox: '0 0 24 24',
          fill: 'currentColor',
          role: 'img',
          'aria-hidden': 'true'
        },
        [h('path', { d: path })]
      );
    };
  }
});

export default AppIcon;
