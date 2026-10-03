"use client";
import { useEffect, useRef } from "react";
import { getBrowserSupabase } from "./supabase/client";

/**
 * 관리자가 예약·장소를 바꾸면 DB 트리거가 공개 채널 'rooms-public' 로 'change' 를 방송한다.
 * 신호를 받으면 onChange 를 호출해 다시 조회한다. 보조로 pollMs 마다 폴링한다.
 */
export function useRealtimeRefresh(onChange: () => void, pollMs = 60_000) {
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  });

  useEffect(() => {
    const sb = getBrowserSupabase();
    const channel = sb
      .channel("rooms-public", { config: { private: false } })
      .on("broadcast", { event: "change" }, () => cb.current())
      .subscribe();

    const timer = setInterval(() => cb.current(), pollMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") cb.current();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      sb.removeChannel(channel);
    };
  }, [pollMs]);
}
