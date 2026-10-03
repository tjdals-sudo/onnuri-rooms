import PasswordForm from "@/components/admin/PasswordForm";
import { getCurrentAdmin } from "@/lib/supabase/server";

export default async function AccountPage() {
  const admin = await getCurrentAdmin();
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-2xl font-bold">내 계정</h1>
      <div className="card p-5">
        <p className="mb-4 text-base">
          로그인 아이디: <strong>{admin?.loginId}</strong>
        </p>
        <h2 className="mb-2 text-lg font-semibold">비밀번호 변경</h2>
        <PasswordForm />
      </div>
    </div>
  );
}
