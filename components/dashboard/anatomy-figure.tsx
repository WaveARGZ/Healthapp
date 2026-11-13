import anatomyOutline from "@/public/images/muscle-map-outline.png";
import armsMask from "@/public/images/muscle-map-masks/arms.png";
import backMask from "@/public/images/muscle-map-masks/back.png";
import chestMask from "@/public/images/muscle-map-masks/chest.png";
import coreMask from "@/public/images/muscle-map-masks/core.png";
import legsMask from "@/public/images/muscle-map-masks/legs.png";
import shouldersMask from "@/public/images/muscle-map-masks/shoulders.png";
import { activityTint } from "@/components/dashboard/activity-color";
import type { MuscleActivity, MuscleGroup } from "@/lib/workouts/muscle-activity";

const imageWidth = 1199;
const imageHeight = 1312;

const regionMasks: Record<MuscleGroup, { src: string; key: string }> = {
  "胸": { src: chestMask.src, key: "chest" },
  "背中": { src: backMask.src, key: "back" },
  "腕": { src: armsMask.src, key: "arms" },
  "肩": { src: shouldersMask.src, key: "shoulders" },
  "腹筋・体幹": { src: coreMask.src, key: "core" },
  "脚": { src: legsMask.src, key: "legs" },
};

export function AnatomyFigure({ view, activity }: { view: "front" | "back"; activity: MuscleActivity }) {
  const viewBox = view === "front" ? "0 0 600 1312" : "600 0 599 1312";

  return <div className="rounded-xl border border-[#b7c8bb] bg-white px-2 pb-4 pt-4 text-center">
    <p className="text-sm font-bold tracking-[0.18em] text-[var(--ink)]">{view === "front" ? "正面" : "背面"}</p>
    <svg viewBox={viewBox} aria-hidden="true" className="mx-auto mt-2 block w-full max-w-[240px]">
      <defs>
        {Object.values(regionMasks).map(({ src, key }) => <mask key={key} id={`muscle-${view}-${key}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width={imageWidth} height={imageHeight} style={{ maskType: "alpha" }}>
          <image href={src} width={imageWidth} height={imageHeight} />
        </mask>)}
      </defs>
      {Object.entries(regionMasks).map(([group, { key }]) => {
        const tint = activityTint(activity[group as MuscleGroup]);
        return tint.opacity > 0 ? <rect key={group} width={imageWidth} height={imageHeight} fill={tint.color} mask={`url(#muscle-${view}-${key}-mask)`} /> : null;
      })}
      <image href={anatomyOutline.src} width={imageWidth} height={imageHeight} />
    </svg>
  </div>;
}
