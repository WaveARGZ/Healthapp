"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { Logo } from "@/components/ui/logo";
import { hasCloudSession } from "@/lib/auth/cognito-session";
import { hasDemoSession } from "@/lib/auth/demo-session";
import { watchFirebaseUser } from "@/lib/auth/firebase-session";
import { isCloudConfigured, isSharedTestEnvironment } from "@/lib/cloud/config";
import { isFirebaseConfigured, isFirebaseSelected } from "@/lib/firebase/config";
import hero from "@/public/images/journal/hero.webp";
import workout from "@/public/images/journal/workout.webp";
import meals from "@/public/images/journal/meals.webp";
import progress from "@/public/images/journal/progress.webp";
import styles from "./landing-page.module.css";

const features = [
  { image: workout, icon: "dumbbell", title: "筋トレの記録", text: "種目ごとに重さ・回数・セット数を記録。前回のメニューを見ながら続けられます。" },
  { image: meals, icon: "leaf", title: "食事の記録", text: "料理名や写真から食事を登録。カロリーと、たんぱく質・脂質・炭水化物を確認できます。" },
  { image: progress, icon: "scale", title: "体重・身体写真の記録", text: "体重はグラフで、身体の変化は正面・背面の写真で振り返れます。" },
] satisfies Array<{ image: typeof hero; icon: IconName; title: string; text: string }>;

export function LandingPage() {
  const router = useRouter();
  useEffect(() => {
    if (isFirebaseSelected) {
      if (isFirebaseConfigured) return watchFirebaseUser((user) => { if (user) router.replace("/dashboard"); });
      return;
    }
    if (isCloudConfigured ? hasCloudSession() : hasDemoSession()) router.replace("/dashboard");
  }, [router]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={`${styles.wrap} ${styles.headerInner}`}>
          <Logo />
          <nav aria-label="メインメニュー" className={styles.nav}>
            <a className={styles.navFeature} href="#features">記録できること</a>
            <Link className={styles.navFeature} href="/food-photo">食事写真AI</Link>
            <Link className={styles.login} href="/login"><Icon name="user" />ログイン</Link>
          </nav>
        </div>
      </header>

      <main>
        <section aria-labelledby="introduction" className={`${styles.wrap} ${styles.hero}`}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>身体づくりの記録アプリ</p>
            <h1 id="introduction" className={styles.headline}>理想の身体を、<br /><span>見える目標に。</span></h1>
            <p className={styles.intro}>筋トレ、食事、体重、身体写真をひとつに。<br />毎日の記録から、自分の変化を振り返れます。</p>
            <div className={styles.actions}>
              <Link className={styles.primary} href="/signup">記録をはじめる<Icon name="arrow-right" /></Link>
              <Link className={styles.secondary} href="/food-photo"><Icon name="camera" />食事写真AIを無料で試す</Link>
            </div>
            <p className={styles.note}>{isSharedTestEnvironment ? "写真解析はログイン不要。テスト環境では学習共有を行いません。" : "写真解析はログイン不要。学習用の共有は任意です。"}</p>
          </div>
          <figure className={styles.visual}>
            <Image src={hero} alt="" preload className={styles.heroImage} />
            <figcaption className={styles.sample}>
              <span className={styles.sampleIcon}><Icon name="dumbbell" /></span>
              <div>
                <div className={styles.sampleLabel}>筋トレの記録例</div>
                <p className={styles.sampleName}>ベンチプレス</p>
                <p className={styles.sampleValue}>60 kg × 10 回 × 3 セット</p>
              </div>
            </figcaption>
          </figure>
        </section>

        <section id="features" aria-labelledby="feature-title" className={styles.featureSection}>
          <div className={styles.wrap}>
            <h2 id="feature-title" className={styles.sectionHeading}>BodyMakeで記録できること</h2>
            <div className={styles.featureGrid}>
              {features.map((feature) => (
                <article className={styles.feature} key={feature.title}>
                  <Image src={feature.image} alt="" className={styles.featureImage} />
                  <div className={styles.featureText}>
                    <h3><Icon name={feature.icon} />{feature.title}</h3>
                    <p>{feature.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={`${styles.wrap} ${styles.footerInner}`}>
          <Logo />
          <p><Icon name="lock" />{isFirebaseSelected ? "記録はアカウントごと、身体写真はこの端末に保存します。" : isCloudConfigured ? "記録はアカウントごとに保管されます。" : "現在はこのブラウザ内に記録を保存します。"}</p>
        </div>
      </footer>
    </div>
  );
}
