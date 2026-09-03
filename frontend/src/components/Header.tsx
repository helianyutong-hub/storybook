import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Moon, History, Sparkles, User } from 'lucide-react';
import { useApp } from '@/store/AppStore';
import { Button } from '@/components/ui/button';

export function Header() {
  const { auth } = useApp();
  const loc = useLocation();
  const nav = useNavigate();

  const links = [
    { to: '/', label: '首页', short: '首页' },
    { to: '/create', label: '做故事', short: '做故事' },
    ...(auth ? [{ to: '/history', label: '历史', short: '历史' }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-[#141233]/70 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-3 sm:px-6">
        {/* Logo：手机上只显示图标，避免标题挤占导航空间 */}
        <Link to="/" className="flex shrink-0 items-center gap-2 font-extrabold tracking-tight">
          <span className="grid size-8 place-items-center rounded-full bg-primary/20 text-primary">
            <Moon className="size-4" />
          </span>
          <span className="hidden text-base sm:inline sm:text-lg">安睡小故事</span>
        </Link>

        <nav className="flex items-center gap-0.5 sm:gap-2">
          {links.map((l) => {
            const active = loc.pathname === l.to;
            const isHistory = l.to === '/history';
            return (
              <Link
                key={l.to}
                to={l.to}
                className={`whitespace-nowrap rounded-full px-2 py-1.5 text-xs font-semibold transition-colors sm:px-3 sm:text-sm ${
                  active ? 'bg-white/10 text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {isHistory ? (
                  <span className="flex items-center gap-1">
                    <History className="size-3.5" />
                    <span className="hidden sm:inline">{l.label}</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <span className="hidden sm:inline">{l.label}</span>
                    <span className="sm:hidden">{l.short}</span>
                  </span>
                )}
              </Link>
            );
          })}

          {auth ? (
            <button
              onClick={() => nav('/profile')}
              className="ml-1 flex max-w-[5.5rem] shrink-0 items-center gap-1 rounded-full bg-white/5 px-2 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-white/10 sm:ml-2 sm:max-w-[10rem] sm:px-3"
              title="个人中心"
            >
              <User className="size-3.5 shrink-0 text-primary" />
              <span className="truncate">{auth.user.name}</span>
            </button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              className="ml-1 rounded-full px-2.5 text-xs sm:ml-2 sm:px-3"
              onClick={() => nav('/login')}
            >
              <Sparkles className="size-3.5" />
              <span className="ml-1 hidden sm:inline">登录</span>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
