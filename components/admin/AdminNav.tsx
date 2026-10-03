"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions/auth";

const MENU = [
  { href: "/admin", label: "예약" },
  { href: "/admin/rooms", label: "장소 관리" },
  { href: "/admin/history", label: "변경 이력" },
  { href: "/admin/access", label: "접속 기록" },
  { href: "/admin/account", label: "내 계정" },
];

export default function AdminNav({ loginId }: { loginId: string }) {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span aria-hidden>⛪</span>
          <span className="hidden sm:inline">장소 사용 현황</span>
          <span className="rounded bg-accent-soft px-1.5 py-0.5 text-xs font-semibold text-accent">관리자</span>
        </Link>
        <nav className="order-last flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto" aria-label="관리자 메뉴">
          {MENU.map((m) => {
            const active = m.href === "/admin" ? path === "/admin" : path.startsWith(m.href);
            return (
              <Link
                key={m.href}
                href={m.href}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-base font-medium ${active ? "bg-accent text-white" : "hover:bg-accent-soft"}`}
              >
                {m.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="rounded-full border border-line px-2.5 py-1 font-semibold">👤 {loginId}</span>
          <form action={logout}>
            <button type="submit" className="btn btn-sm">
              로그아웃
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
