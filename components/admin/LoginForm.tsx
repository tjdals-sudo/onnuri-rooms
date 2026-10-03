"use client";
import Link from "next/link";
import { useActionState } from "react";
import { login, type AuthState } from "@/lib/actions/auth";

export default function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? "/admin"} />
      <div>
        <label className="label" htmlFor="loginId">
          아이디
        </label>
        <input id="loginId" name="loginId" className="input" placeholder="admin1" autoComplete="username" required autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="password">
          비밀번호
        </label>
        <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
      </div>
      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "확인 중…" : "로그인"}
      </button>
      <p className="text-center text-sm">
        <Link href="/" className="text-muted underline">
          ← 사용 현황으로 돌아가기
        </Link>
      </p>
    </form>
  );
}
