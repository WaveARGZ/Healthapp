"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { preloadGoogleIdentity, requestGoogleDriveAccessToken, verifyGoogleDriveAccess } from "@/lib/drive/google-drive-client";
import { saveGoogleDriveClientId } from "@/lib/storage/google-drive-settings";
import { useGoogleDriveClientId } from "@/hooks/use-google-drive-client-id";

export function GoogleDriveSettings() {
  const savedClientId = useGoogleDriveClientId();
  const clientIdRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { void preloadGoogleIdentity().catch(() => undefined); }, []);

  function saveSettings() {
    const value = clientIdRef.current?.value.trim() ?? "";
    saveGoogleDriveClientId(value);
    setStatus(value ? "クライアントIDをこの端末に保存しました。続けてGoogle Driveに接続してください。" : "Drive連携設定を削除しました。");
  }

  async function connect() {
    if (!savedClientId) return;
    setBusy(true);
    setStatus("Googleの認証画面を開いています…");
    try {
      const token = await requestGoogleDriveAccessToken(savedClientId);
      await verifyGoogleDriveAccess(token);
      setStatus("接続できました。正解を登録すると、写真とラベルをGoogle Driveへ保存します。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Google Driveに接続できませんでした。設定をご確認ください。");
    } finally {
      setBusy(false);
    }
  }

  return <section className="mt-10 border-y border-[var(--line)] py-6" aria-labelledby="drive-settings-title">
    <h2 id="drive-settings-title" className="text-base font-bold">Google Driveへの正解データ保存</h2>
    <p className="mt-2 text-xs leading-6 text-[var(--muted)]">Google CloudでDrive APIを有効にし、ウェブアプリ用OAuthクライアントIDを作成して入力してください。承認後に専用フォルダが作成され、食事写真・正解料理名・栄養値を保存します。パスワードやOAuthトークンは保存しません。</p>
    <label className="mt-4 block text-xs font-bold text-[var(--ink)]" htmlFor="google-drive-client-id">OAuthクライアントID<input key={savedClientId} ref={clientIdRef} id="google-drive-client-id" autoComplete="off" defaultValue={savedClientId} placeholder="xxxxx.apps.googleusercontent.com" className="mt-2 h-12 w-full rounded border border-[var(--line)] bg-white px-3 text-sm font-normal outline-none focus:border-[var(--sage-deep)]" /></label>
    <div className="mt-3 grid gap-2 sm:grid-cols-2"><Button type="button" variant="secondary" onClick={saveSettings}>{savedClientId ? "設定を保存" : "クライアントIDを保存"}</Button><Button type="button" onClick={() => void connect()} disabled={!savedClientId || busy}>{busy ? "接続中…" : "Google Driveに接続"}</Button></div>
    {status ? <p role="status" className="mt-3 text-xs leading-5 text-[var(--muted)]">{status}</p> : null}
    <p className="mt-3 text-[10px] leading-5 text-[var(--muted)]">OAuthの承認済みJavaScript生成元には <span className="select-all">https://waveargz.github.io</span> と、ローカル開発用の <span className="select-all">http://localhost:3000</span> を登録してください。必要な権限はアプリが作成したファイルへのアクセスのみです。</p>
  </section>;
}
