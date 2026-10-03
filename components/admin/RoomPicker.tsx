"use client";
import { FLOOR_COLORS } from "@/lib/floor-colors";
import { FLOORS, FLOOR_LABEL, type Room } from "@/lib/types";

export default function RoomPicker({
  rooms,
  selectedId,
  onSelect,
}: {
  rooms: Room[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {FLOORS.map((f) => {
        const list = rooms.filter((r) => r.floor === f);
        if (list.length === 0) return null;
        const c = FLOOR_COLORS[f];
        return (
          <div key={f}>
            <div className="mb-1 text-xs font-bold" style={{ color: c.text }}>{FLOOR_LABEL[f]}</div>
            <div className="grid grid-cols-2 gap-1.5">
              {list.map((r) => {
                const sel = r.id === selectedId;
                return (
                  <button
                    key={r.id}
                    onClick={() => onSelect(r.id)}
                    className="rounded-lg border px-2 py-1.5 text-left text-sm"
                    style={{
                      borderColor: sel ? c.bg : c.border,
                      background: sel ? c.bg : c.soft,
                      color: sel ? "#fff" : c.text,
                    }}
                    aria-pressed={sel}
                  >
                    <div className="truncate font-semibold">{r.name}</div>
                    <div className="truncate text-xs opacity-85">
                      {r.capacity_text} · {r.seating_type}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
