import { useRef } from "react";

// Bottom sheet ala Spotify: geser handle (atau header) ke bawah untuk tutup.
// Touch drag di handle: dy>90px = tutup, di bawah itu snap balik.
export const MixerSheet: React.FC<{
  onClose: () => void;
  mixerContent: React.ReactNode;
}> = ({ onClose, mixerContent }) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const startY = useRef<number | null>(null);

  const begin = (clientY: number) => {
    startY.current = clientY;
    const s = panelRef.current?.style;
    if (s) { s.transition = "none"; }
  };
  const move = (clientY: number) => {
    if (startY.current === null || !panelRef.current) return;
    const dy = Math.max(0, clientY - startY.current);
    panelRef.current.style.transform = `translateY(${dy}px)`;
  };
  const end = () => {
    if (startY.current === null || !panelRef.current) return;
    const dy = parseFloat(panelRef.current.style.transform.replace(/[^0-9]/g, "")) || 0;
    startY.current = null;
    const s = panelRef.current.style;
    s.transition = "transform 0.25s ease";
    if (dy > 90) {
      s.transform = "translateY(100%)";
      onClose();
    } else {
      s.transform = "";
    }
  };

  return (
    <div className="md:hidden fixed inset-0 z-40 flex items-end bg-black/70" onClick={onClose}>
      <div
        ref={panelRef}
        className="w-full rounded-t-2xl bg-[#121212] border-t border-white/10 p-4 pb-24 max-h-[75vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto -my-3 pt-3 pb-3 flex justify-center cursor-grab active:cursor-grabbing touch-none select-none"
          onTouchStart={(e) => begin(e.touches[0].clientY)}
          onTouchMove={(e) => move(e.touches[0].clientY)}
          onTouchEnd={end}
          onMouseDown={(e) => begin(e.clientY)}
          onMouseMove={(e) => startY.current !== null && e.buttons === 1 && move(e.clientY)}
          onMouseUp={end}
          onMouseLeave={() => startY.current !== null && end()}
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#535353]" />
        </div>
        {mixerContent}
      </div>
    </div>
  );
};
