'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { RequireAuth } from '@/components/require-auth';
import { useAuth } from '@/components/providers/auth-provider';

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  return (
    <RequireAuth>
      <div className="flex h-screen bg-muted/40">
        <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r bg-background px-4 py-6">
          <span className="px-2 text-sm font-semibold">노래맞히기 관리자</span>
          <nav className="mt-6 flex flex-col gap-1 text-sm font-medium">
            <Link
              href="/inquiries"
              className="rounded-md px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              문의 관리
            </Link>
            <Link
              href="/quizzes"
              className="rounded-md px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              퀴즈 관리
            </Link>
            <Link
              href="/admins"
              className="rounded-md px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              관리자 관리
            </Link>
          </nav>
          <div className="mt-auto flex flex-col gap-1">
            <Link
              href="/settings"
              className="rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              설정
            </Link>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              로그아웃
            </Button>
          </div>
        </aside>
        <main className="flex-1 overflow-y-auto px-6 py-8">{children}</main>
      </div>
    </RequireAuth>
  );
}
