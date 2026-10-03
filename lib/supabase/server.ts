import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/** 서버 컴포넌트·서버 액션용 (로그인 세션 쿠키 사용, RLS 적용) */
export async function getServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // 서버 컴포넌트에서 호출되면 쿠키를 쓸 수 없다. proxy.ts 가 세션을 갱신하므로 무시해도 된다.
          }
        },
      },
    },
  );
}

/** 서버 전용 관리자 클라이언트 (RLS 우회). 시트 동기화 상태 기록·Cron 에만 사용 */
export function getServiceSupabase() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY 환경변수가 없습니다");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** 현재 로그인한 관리자 (없으면 null) */
export async function getCurrentAdmin() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("admins")
    .select("user_id, login_id, display_name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return null;
  return { userId: user.id, loginId: data.login_id as string, displayName: data.display_name as string };
}
