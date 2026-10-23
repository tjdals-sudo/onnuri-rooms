import Image from "next/image";
import { Suspense } from "react";
import HomeClient from "@/components/public/HomeClient";
import { getPublicSupabase } from "@/lib/supabase/server";
import type { Room } from "@/lib/types";

// 장소 목록은 드물게 바뀌므로 정적으로 미리 렌더해 두고 1시간마다(또는 장소 변경 시) 다시 만든다.
// 예약은 화면에서 실시간으로 불러온다.
export const revalidate = 3600;

async function loadRooms(): Promise<Room[] | null> {
  try {
    const { data, error } = await getPublicSupabase()
      .from("rooms")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) return null;
    return (data ?? []) as Room[];
  } catch {
    return null; // 미리 못 읽어도 화면에서 다시 불러온다
  }
}

export default async function HomePage() {
  const rooms = await loadRooms();
  return (
    <Suspense fallback={<HomeFallback />}>
      <HomeClient initialRooms={rooms} />
    </Suspense>
  );
}

/** 첫 화면(자바스크립트가 뜨기 전)에도 제목과 뼈대가 보이도록 */
function HomeFallback() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-background">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3">
          <Image src="/logo.jpg" alt="온누리교회" width={40} height={40} className="h-10 w-10 rounded-lg" priority />
          <div>
            <h1 className="text-lg font-bold leading-tight md:text-xl">인천 온누리교회 장소 사용 현황</h1>
            <p className="hidden text-sm text-muted md:block">누구나 실시간으로 확인할 수 있어요</p>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1600px] flex-1 space-y-3 px-4 py-4" aria-busy>
        <div className="skeleton h-24" />
        <div className="skeleton h-12" />
        <div className="skeleton h-12" />
        <div className="skeleton h-12" />
      </main>
    </div>
  );
}
