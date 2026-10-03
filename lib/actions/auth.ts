"use server";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";

const DOMAIN = process.env.ADMIN_ID_DOMAIN || "onnuri-incheon.local";

export type AuthState = { error?: string; ok?: boolean };

/** 아이디+비밀번호 로그인. 아이디는 내부적으로 `${id}@${ADMIN_ID_DOMAIN}` 이메일로 바뀐다. */
export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const loginId = String(formData.get("loginId") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin");

  if (!/^admin[1-3]$/.test(loginId)) {
    return { error: "아이디는 admin1, admin2, admin3 중 하나입니다." };
  }
  if (!password) return { error: "비밀번호를 입력해 주세요." };

  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email: `${loginId}@${DOMAIN}`, password });
  if (error || !data.user) {
    return { error: "아이디 또는 비밀번호가 올바르지 않습니다." };
  }

  // 관리자 테이블에 등록된 계정인지 확인 (RLS: 본인이 관리자면 조회됨)
  const { data: admin } = await supabase.from("admins").select("login_id").eq("user_id", data.user.id).maybeSingle();
  if (!admin) {
    await supabase.auth.signOut();
    return { error: "관리자로 등록되지 않은 계정입니다." };
  }

  await supabase.from("login_logs").insert({ admin_id: data.user.id, admin_login_id: admin.login_id, event: "login" });

  redirect(next.startsWith("/admin") ? next : "/admin");
}

export async function logout(): Promise<void> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: admin } = await supabase.from("admins").select("login_id").eq("user_id", user.id).maybeSingle();
    if (admin) {
      await supabase.from("login_logs").insert({ admin_id: user.id, admin_login_id: admin.login_id, event: "logout" });
    }
    await supabase.auth.signOut();
  }
  redirect("/admin/login");
}

/** 본인 비밀번호 변경 (현재 비밀번호 재확인) */
export async function changePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const current = String(formData.get("current") ?? "");
  const next1 = String(formData.get("next1") ?? "");
  const next2 = String(formData.get("next2") ?? "");

  if (next1.length < 8) return { error: "새 비밀번호는 8자 이상이어야 합니다." };
  if (next1 !== next2) return { error: "새 비밀번호가 서로 다릅니다." };
  if (next1 === current) return { error: "현재 비밀번호와 다른 비밀번호를 입력해 주세요." };

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "로그인이 필요합니다." };

  const { error: verifyErr } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
  if (verifyErr) return { error: "현재 비밀번호가 올바르지 않습니다." };

  const { error } = await supabase.auth.updateUser({ password: next1 });
  if (error) return { error: `변경 실패: ${error.message}` };
  return { ok: true };
}
