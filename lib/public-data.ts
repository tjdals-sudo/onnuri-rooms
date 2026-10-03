"use client";
import { getBrowserSupabase } from "./supabase/client";
import type { PublicReservation, Room } from "./types";

/** 활성 장소 (정렬 순) */
export async function fetchRooms(): Promise<Room[]> {
  const sb = getBrowserSupabase();
  const { data, error } = await sb
    .from("rooms")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Room[];
}

/** 기간과 겹치는 공개 예약 (개인정보 없음) */
export async function fetchPublicReservations(start: Date, end: Date): Promise<PublicReservation[]> {
  const sb = getBrowserSupabase();
  const { data, error } = await sb
    .from("reservations_public")
    .select("*")
    .lt("start_at", end.toISOString())
    .gt("end_at", start.toISOString())
    .order("start_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PublicReservation[];
}
