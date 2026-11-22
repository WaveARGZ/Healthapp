"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Logo } from "@/components/ui/logo";
import { hasCloudSession } from "@/lib/auth/cognito-session";
import { hasDemoSession } from "@/lib/auth/demo-session";
import { watchFirebaseUser } from "@/lib/auth/firebase-session";
import { getProfileDestination } from "@/lib/auth/profile-destination";
import { isCloudConfigured, isSharedTestEnvironment } from "@/lib/cloud/config";
import { isFirebaseConfigured, isFirebaseSelected } from "@/lib/firebase/config";
import styles from "./landing-page.module.css";

const features = [
  { title: "筋トレ", text: "種目・重さ・回数を記録。前回のメニューもすぐ確認。" },
  { title: "食事", text: "料理を選んで、カロリーと栄養を確認。" },
  { title: "体重・写真", text: "グラフと写真で、日々の変化を振り返る。" },
];

export function LandingPage() {
  const router = useRouter();
  useEffect(() => {
    if (isFirebaseSelected) {
      if (isFirebaseConfigured) return watchFirebaseUser((user) => { if (user) router.replace("/dashboard"); });
      return;
    }
    if (isCloudConfigured) {
      if (hasCloudSession()) router.replace("/dashboard");
      return;
    }
    if (!hasDemoSession()) return;
    let active = true;
    void getProfileDestination().then((destination) => { if (active) router.replace(destination); });
    return () => { active = false; };
  }, [router]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={`${styles.wrap} ${styles.headerInner}`}>
          <Logo />
          <Link className={styles.login} href="/login">ログイン</Link>
        </div>
      </header>

      <main className={styles.wrap}>
        <section aria-labelledby="introduction" className={styles.hero}>
          <h1 id="introduction" className={styles.headline}>今日の記録を、<br />明日の自分へ。</h1>
          <p className={styles.intro}>筋トレ・食事・体重を、ひとつの場所に。</p>
          <div className={styles.actions}>
            <Link className={styles.primary} href="/signup">記録をはじめる</Link>
            <Link className={styles.secondary} href="/login">ログイン</Link>
          </div>
        </section>

        <section id="features" aria-label="記録できること" className={styles.features}>
          {features.map((feature) => <div className={styles.feature} key={feature.title}>
            <h2>{feature.title}</h2>
            <p>{feature.text}</p>
          </div>)}
        </section>

        <section className={styles.photoTry} aria-labelledby="photo-try-title">
          <div>
            <h2 id="photo-try-title">写真から食事を調べる</h2>
            <p>{isSharedTestEnvironment ? "ログイン不要。テスト環境では学習共有は無効です。" : "ログイン不要。学習用の共有は任意です。"}</p>
          </div>
          <Link className={styles.secondary} href="/food-photo">写真解析を試す</Link>
        </section>
      </main>
      <footer className={`${styles.wrap} ${styles.footer}`}>
        <p>{isFirebaseSelected ? "記録はアカウントに、身体写真はこの端末に保存します。" : isCloudConfigured ? "記録はアカウントに保存します。" : "現在はこのブラウザ内に記録を保存します。"}</p>
      </footer>
    </div>
  );
}
