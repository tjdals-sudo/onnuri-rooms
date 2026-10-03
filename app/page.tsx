import { Suspense } from "react";
import HomeClient from "@/components/public/HomeClient";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted">불러오는 중…</div>}>
      <HomeClient />
    </Suspense>
  );
}
