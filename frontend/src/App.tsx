import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AnimatedRoutes } from '@/components/AnimatedRoutes';
import { PageTransition } from '@/components/PageTransition';
import { Header } from '@/components/Header';
import { AppProvider } from '@/store/AppStore';
import Home from './pages/Home';
import Create from './pages/Create';
import Generating from './pages/Generating';
import Preview from './pages/Preview';
import Player from './pages/Player';
import History from './pages/History';
import Login from './pages/Login';
import Profile from './pages/Profile';
import NotFound from './pages/NotFound';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60 * 1000, gcTime: 5 * 60 * 1000, retry: 1, refetchOnWindowFocus: false, refetchOnReconnect: false },
    mutations: { retry: 1 },
  },
});

// GitHub Pages 部署在 /storybook/ 子路径下，路由需匹配该 basename；
// 本地开发（base 为 /）时 basename 为空字符串，行为不变。
const BASENAME = import.meta.env.BASE_URL.replace(/\/+$/, '');

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter basename={BASENAME}>
          <AppProvider>
            <Toaster richColors position="top-center" />
            <Header />
            <main className="min-h-[calc(100vh-3.5rem)]">
              <AnimatedRoutes>
                <Route path="/" data-genie-key="Home" data-genie-title="首页" element={<PageTransition transition="slide-up"><Home /></PageTransition>} />
                <Route path="/create" data-genie-key="Create" data-genie-title="制作故事" element={<PageTransition transition="slide-up"><Create /></PageTransition>} />
                <Route path="/generating" data-genie-key="Generating" data-genie-title="生成中" element={<PageTransition transition="fade"><Generating /></PageTransition>} />
                <Route path="/preview/:id" data-genie-key="Preview" data-genie-title="家长预览" element={<PageTransition transition="slide-up"><Preview /></PageTransition>} />
                <Route path="/player/:id" data-genie-key="Player" data-genie-title="播放" element={<PageTransition transition="fade"><Player /></PageTransition>} />
                <Route path="/history" data-genie-key="History" data-genie-title="历史" element={<PageTransition transition="slide-up"><History /></PageTransition>} />
                <Route path="/login" data-genie-key="Login" data-genie-title="登录" element={<PageTransition transition="slide-up"><Login /></PageTransition>} />
                <Route path="/profile" data-genie-key="Profile" data-genie-title="个人中心" element={<PageTransition transition="slide-up"><Profile /></PageTransition>} />
                <Route path="*" data-genie-key="NotFound" data-genie-title="未找到" element={<PageTransition transition="fade"><NotFound /></PageTransition>} />
              </AnimatedRoutes>
            </main>
          </AppProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
