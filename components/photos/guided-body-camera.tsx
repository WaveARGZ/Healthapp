"use client";

import { useEffect, useRef, useState } from "react";
import { getPortraitCrop } from "@/lib/photos/camera-framing";
import type { BodyPhotoView } from "@/types/progress";

const guideStorageKey = "bodymake-camera-guide-height-v1";

function cameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError")) {
    return "カメラへのアクセスが許可されていません。ブラウザの設定を確認するか、写真を選んでください。";
  }
  return "カメラを起動できませんでした。別のブラウザで開くか、写真を選んでください。";
}

export function GuidedBodyCamera({ view, onClose, onCapture }: {
  view: BodyPhotoView;
  onClose: () => void;
  onCapture: (file: File) => Promise<void> | void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState("カメラを起動しています…");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [guideHeight, setGuideHeight] = useState(() => {
    if (typeof window === "undefined") return 78;
    try {
      const saved = Number(window.localStorage.getItem(guideStorageKey));
      if (saved >= 68 && saved <= 86) return saved;
    } catch { /* 保存が使えないブラウザでも撮影を続ける */ }
    return 78;
  });

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("このブラウザではガイド付き撮影が使えません。写真を選んでください。");
        return;
      }
      try {
        // Rear camera avoids the wide-angle distortion common to selfie cameras.
        const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 2560 } } });
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        streamRef.current = stream;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        if (!cancelled) { setReady(true); setStatus(""); }
      } catch (error) {
        if (!cancelled) setStatus(cameraErrorMessage(error));
      }
    }
    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (video) video.srcObject = null;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  function changeGuideHeight(value: number) {
    setGuideHeight(value);
    try { window.localStorage.setItem(guideStorageKey, String(value)); } catch { /* 任意の設定 */ }
  }

  async function takePhoto() {
    const video = videoRef.current;
    if (!ready || !video?.videoWidth || !video.videoHeight || busy) return;
    setBusy(true);
    try {
      // Match the 3:4 preview exactly. The guide is DOM-only and never drawn to canvas.
      const width = 900;
      const height = 1200;
      const crop = getPortraitCrop(video.videoWidth, video.videoHeight);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("このブラウザでは写真を作成できません。");
      context.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("写真を作成できませんでした。");
      await onCapture(new File([blob], `bodymake-${view}-${Date.now()}.jpg`, { type: "image/jpeg" }));
      onClose();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "撮影に失敗しました。もう一度お試しください。");
    } finally { setBusy(false); }
  }

  const inset = (100 - guideHeight) / 2;
  return <div role="dialog" aria-modal="true" aria-label={`${view === "front" ? "正面" : "背面"}のガイド付き撮影`} className="fixed inset-0 z-[100] overflow-y-auto bg-[#101713] text-white">
    <div className="mx-auto flex min-h-full w-full max-w-xl flex-col px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between gap-4 pb-3">
        <div><p className="text-xs text-white/65">身体写真 · ガイド付き撮影</p><h2 className="mt-1 text-lg font-bold">{view === "front" ? "正面" : "背面"}を撮影</h2></div>
        <button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded border border-white/40 px-4 text-sm font-semibold">閉じる</button>
      </div>
      <div className="relative mx-auto w-full max-w-[390px] overflow-hidden rounded-md border border-white/30 bg-black aspect-[3/4]">
        <video ref={videoRef} autoPlay muted playsInline aria-label="カメラ映像" className="absolute inset-0 h-full w-full object-cover" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-white/55" />
          <div className="absolute left-1/2 w-[62%] -translate-x-1/2 rounded-[45%_45%_12%_12%] border-2 border-dashed border-white/90" style={{ top: `${inset}%`, bottom: `${inset}%` }} />
          <div className="absolute left-[19%] right-[19%] border-t border-white/65" style={{ top: `${inset}%` }} />
          <div className="absolute left-[19%] right-[19%] border-t border-white/65" style={{ bottom: `${inset}%` }} />
          <span className="absolute left-3 rounded bg-black/65 px-2 py-1 text-[10px]" style={{ top: `${inset}%` }}>頭</span>
          <span className="absolute bottom-0 left-3 rounded bg-black/65 px-2 py-1 text-[10px]" style={{ bottom: `${inset}%` }}>足元</span>
        </div>
        {!ready && <div className="absolute inset-0 grid place-items-center bg-black/70 p-6 text-center text-sm leading-6" role="status">{status}</div>}
      </div>
      <p className="mt-3 text-center text-xs leading-5 text-white/80">頭と足元を線の内側に入れ、身体の中心を縦線に合わせてください。ガイド線は写真に写りません。</p>
      <label className="mt-4 text-xs font-semibold" htmlFor="body-photo-guide-height">体格に合わせて枠の高さを調整</label>
      <input id="body-photo-guide-height" type="range" min="68" max="86" value={guideHeight} onChange={(event) => changeGuideHeight(Number(event.target.value))} className="mt-2 w-full accent-[#a9c9aa]" />
      <div className="mt-4 rounded-md border border-white/20 bg-white/5 p-3 text-xs leading-6 text-white/85">
        <p>① スマホを縦向き・おへその高さで固定。背面カメラの1倍を使い、広角・ズームは避ける。</p>
        <p>② 無地の背景から離れ、カメラから約2〜3m。全身に少し余白を残す。</p>
        <p>③ 正面・背面で、カメラ位置・立ち位置・明るさを変えない。腕は身体から少し離す。</p>
      </div>
      {ready && status && <p role="alert" className="mt-3 text-center text-xs text-[#ffd3c3]">{status}</p>}
      <button type="button" onClick={() => void takePhoto()} disabled={!ready || busy} className="mt-4 min-h-13 rounded-md bg-white px-5 py-3 text-sm font-bold text-[#183524] disabled:opacity-50">{busy ? "写真を準備中…" : "この位置で撮影"}</button>
    </div>
  </div>;
}
