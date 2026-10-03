"use client";
import { useActionState } from "react";
import { changePassword, type AuthState } from "@/lib/actions/auth";

export default function PasswordForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(changePassword, {});
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label" htmlFor="current">현재 비밀번호</label>
        <input id="current" name="current" type="password" className="input" autoComplete="current-password" required />
      </div>
      <div>
        <label className="label" htmlFor="next1">새 비밀번호 (8자 이상)</label>
        <input id="next1" name="next1" type="password" className="input" autoComplete="new-password" minLength={8} required />
      </div>
      <div>
        <label className="label" htmlFor="next2">새 비밀번호 확인</label>
        <input id="next2" name="next2" type="password" className="input" autoComplete="new-password" minLength={8} required />
      </div>
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state.ok && <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-ok">비밀번호가 변경되었습니다.</p>}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "변경 중…" : "비밀번호 변경"}
      </button>
    </form>
  );
}
