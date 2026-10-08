"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getGoogleAccountEmail, preloadGoogleIdentity, requestGoogleAccountToken } from "@/lib/drive/google-drive-client";
import { useGoogleDriveClientId, useTrainingDataEndpoint } from "@/hooks/use-google-drive-client-id";

export function GoogleDriveSettings() {
  const savedClientId = useGoogleDriveClientId();
  const savedEndpoint = useTrainingDataEndpoint();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { void preloadGoogleIdentity().catch(() => undefined); }, []);

  async function connect() {
    if (!savedClientId) return;
    setBusy(true);
    setStatus("Googleの認証画面を開いています…");
    try {
      const token = await requestGoogleAccountToken(savedClientId);
      const email = await getGoogleAccountEmail(token);
      setStatus(`${email}でログインを確認しました。送信時にもGoogleアカウント認証が必要です。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Googleログインを確認できませんでした。設定をご確認ください。");
    } finally {
      setBusy(false);
    }
  }

  return <section className="mt-10 border-y border-[var(--line)] py-6" aria-labelledby="drive-settings-title">
    <h2 id="drive-settings-title" className="text-base font-bold">共有Driveへの学習データ保存</h2>
    <p className="mt-3 text-sm leading-7 text-[var(--muted)]">全ユーザーの正解データをアプリ所有者のDriveへ集約します。共有する場合はGoogleログインと毎回の同意が必要です。Drive APIへのユーザー個人のアクセス権は要求しません。</p>
    <dl className="mt-4 space-y-3 rounded-md bg-[var(--sand)] p-4 text-xs leading-6 text-[var(--ink-soft)]"><div><dt className="font-semibold">共有先</dt><dd>{savedEndpoint ? "アプリ共通のDriveに設定済み" : "運営側で準備中"}</dd></div><div><dt className="font-semibold">Googleログイン</dt><dd>{savedClientId ? "設定済み" : "未設定"}</dd></div></dl>
    <div className="mt-4"><Button type="button" className="w-full sm:w-auto" onClick={() => void connect()} disabled={!savedClientId || busy}>{busy ? "確認中…" : "Googleログインを確認"}</Button></div>
    {status ? <p role="status" className="mt-3 break-words text-sm leading-6 text-[var(--muted)]">{status}</p> : null}
    <details className="mt-4 text-xs leading-6 text-[var(--muted)]"><summary className="min-h-11 py-3 font-medium">管理者向けの接続設定</summary><p className="mt-2">OAuthの承認済みJavaScript生成元には <span className="select-all break-all">https://waveargz.github.io</span> と、ローカル開発用の <span className="select-all break-all">http://localhost:3000</span> を登録してください。写真を再圧縮して位置情報などのEXIFを除いてから、修正済み料理名・候補・栄養値とともに共有Driveへ送ります。受け口URLは運営側で一元管理します。</p></details>
  </section>;
}
