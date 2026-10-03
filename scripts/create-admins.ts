/**
 * 관리자 3계정(admin1~3) 생성 스크립트
 *   npx tsx scripts/create-admins.ts
 * - .env.local 의 ADMIN1_PASSWORD ~ ADMIN3_PASSWORD 로 비밀번호 설정
 * - 이미 있는 계정은 비밀번호를 덮어쓰지 않고 건너뜀 (--reset-password 를 붙이면 재설정)
 * - 내부 이메일은 `${login_id}@${ADMIN_ID_DOMAIN}` 형식 (화면에는 아이디만 보임)
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const domain = process.env.ADMIN_ID_DOMAIN || "onnuri-incheon.local";
const reset = process.argv.includes("--reset-password");

if (!url || !secret) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 가 .env.local 에 필요합니다.");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (listErr) throw listErr;

  for (const n of [1, 2, 3]) {
    const loginId = `admin${n}`;
    const email = `${loginId}@${domain}`;
    const password = process.env[`ADMIN${n}_PASSWORD`];
    if (!password || password.length < 8) {
      console.error(`ADMIN${n}_PASSWORD 가 비어 있거나 8자 미만입니다. 건너뜁니다.`);
      continue;
    }
    let user = list.users.find((u) => u.email?.toLowerCase() === email);
    if (!user) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { login_id: loginId },
      });
      if (error) throw error;
      user = data.user;
      console.log(`✔ ${loginId} 생성`);
    } else if (reset) {
      const { error } = await admin.auth.admin.updateUserById(user.id, { password });
      if (error) throw error;
      console.log(`✔ ${loginId} 비밀번호 재설정`);
    } else {
      console.log(`· ${loginId} 이미 있음 (비밀번호 유지)`);
    }
    const { error: upErr } = await admin
      .from("admins")
      .upsert({ user_id: user.id, login_id: loginId, display_name: loginId }, { onConflict: "user_id" });
    if (upErr) throw upErr;
  }
  console.log("완료. 이제 /admin/login 에서 아이디+비밀번호로 로그인할 수 있습니다.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
