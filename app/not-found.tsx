import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card max-w-md p-6 text-center">
        <h1 className="text-xl font-bold">페이지를 찾을 수 없습니다</h1>
        <Link href="/" className="btn btn-primary mt-4">사용 현황으로</Link>
      </div>
    </main>
  );
}
