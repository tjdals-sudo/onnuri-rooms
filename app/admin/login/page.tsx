import LoginForm from "@/components/admin/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-5 text-center">
          <div className="text-3xl" aria-hidden>⛪</div>
          <h1 className="mt-1 text-xl font-bold">관리자 로그인</h1>
          <p className="text-sm text-muted">인천 온누리교회 장소 사용 현황</p>
        </div>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
