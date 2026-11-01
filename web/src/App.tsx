import { AppstoreOutlined, FormOutlined, HistoryOutlined, SettingOutlined } from '@ant-design/icons';
import { App as AntApp, ConfigProvider, Layout, Menu } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import ConfigPage from './pages/ConfigPage';
import HistoryPage from './pages/HistoryPage';
import InputPage from './pages/InputPage';
import KanbanPage from './pages/KanbanPage';

const { Sider, Content } = Layout;

const theme = {
  token: {
    colorPrimary: '#0f6e6b',
    colorInfo: '#0f6e6b',
    colorSuccess: '#2f6f4e',
    colorWarning: '#a15c07',
    colorError: '#9f2d2d',
    colorBgLayout: '#efeae0',
    colorBgContainer: '#fbf8f2',
    colorBorder: '#e0d5c4',
    colorText: '#1c1915',
    colorTextSecondary: '#6d6458',
    borderRadius: 10,
    fontSize: 16,
    fontFamily: '"Figtree", "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
    controlHeight: 40,
  },
  components: {
    Layout: {
      siderBg: '#1c1915',
      bodyBg: '#efeae0',
    },
    Menu: {
      darkItemBg: '#1c1915',
      darkSubMenuItemBg: '#1c1915',
      darkItemSelectedBg: '#0f6e6b',
      darkItemHoverBg: '#2c2824',
      darkItemColor: '#f3efe6',
      darkItemSelectedColor: '#ffffff',
    },
  },
};

function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={232} theme="dark">
        <div className="brand">
          <span className="brand-mark">LogFlow</span>
          <span className="brand-sub">每日记录</span>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={[
            { key: '/', icon: <FormOutlined />, label: '输入' },
            { key: '/kanban', icon: <AppstoreOutlined />, label: '看板' },
            { key: '/config', icon: <SettingOutlined />, label: '配置' },
            { key: '/history', icon: <HistoryOutlined />, label: '历史' },
          ]}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Content className="app-content">
          <Routes>
            <Route path="/" element={<InputPage />} />
            <Route path="/kanban" element={<KanbanPage />} />
            <Route path="/config" element={<ConfigPage />} />
            <Route path="/history" element={<HistoryPage />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

export default function App() {
  return (
    <ConfigProvider locale={zhCN} theme={theme}>
      <AntApp>
        <BrowserRouter>
          <Shell />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}
