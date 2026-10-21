import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface Detector { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> }
declare global {
  interface Window { BarcodeDetector?: new (opts?: { formats: string[] }) => Detector }
}

export const scannerSupported = () => typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices;

/** Tarayıcının yerleşik BarcodeDetector API'si ile kameradan barkod okur (Chrome, Android). */
export function BarcodeScanner({ onDetect, onClose }: { onDetect: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const detected = useRef(onDetect);
  detected.current = onDetect;

  useEffect(() => {
    let stream: MediaStream | undefined;
    let raf = 0;
    let stopped = false;
    const detector = new window.BarcodeDetector!({ formats: ["ean_13", "ean_8", "code_128", "qr_code", "upc_a"] });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const tick = async () => {
          if (stopped || !video.current) return;
          const codes = await detector.detect(video.current).catch(() => []);
          if (codes[0]) { navigator.vibrate?.(80); detected.current(codes[0].rawValue); return; }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setError("Kameraya erişilemedi. Tarayıcı iznini kontrol edin.");
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={onClose}>
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-black" onClick={(e) => e.stopPropagation()}>
        <video ref={video} className="aspect-[3/4] w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-x-10 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,.35)]" />
        <p className="absolute inset-x-0 bottom-4 text-center text-sm text-white">{error ?? "Barkodu çerçevenin içine getirin"}</p>
        <button onClick={onClose} className="absolute right-3 top-3 rounded-full bg-black/50 p-2 text-white" aria-label="Kapat"><X className="size-5" /></button>
      </div>
    </div>
  );
}
