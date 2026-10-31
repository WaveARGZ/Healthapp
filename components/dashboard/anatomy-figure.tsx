import anatomyImage from "@/public/images/muscle-anatomy.png";
import type { MuscleActivity, MuscleGroup } from "@/lib/workouts/muscle-activity";

export const activityColors = ["transparent", "#42ad61", "#397fcb", "#ca8b80"];
const overlayOpacity = [0, 0.85, 0.9, 0];

const frontRegions: Record<MuscleGroup, string[]> = {
  "胸": ["M211 240Q360 206 510 240L504 356Q360 388 218 356Z"],
  "背中": [],
  "腕": [
    "M178 297Q220 283 251 324L231 416Q207 505 151 571L97 637L43 641L64 560Q106 486 137 407Z",
    "M542 297Q500 283 469 324L489 416Q513 505 569 571L623 637L677 641L656 560Q614 486 583 407Z",
  ],
  "肩": [
    "M202 228Q243 207 275 238L261 317Q234 352 190 349L166 304Z",
    "M518 228Q477 207 445 238L459 317Q486 352 530 349L554 304Z",
  ],
  "腹筋・体幹": ["M257 348Q360 361 463 348L484 537L457 621L263 621L236 537Z"],
  "脚": [
    "M234 611L360 612L359 839L334 1045L320 1192L220 1192L221 1056L200 862Z",
    "M486 611L360 612L361 839L386 1045L400 1192L500 1192L499 1056L520 862Z",
  ],
};

const backRegions: Record<MuscleGroup, string[]> = {
  "胸": [],
  "背中": ["M823 203Q920 184 1017 203L1050 340L1018 510Q969 539 920 555Q871 539 822 510L790 340Z"],
  "腕": [
    "M749 302Q786 295 809 337L792 417Q759 507 706 578L667 646L613 643L627 558Q653 464 684 398Z",
    "M1091 302Q1054 295 1031 337L1048 417Q1081 507 1134 578L1173 646L1227 643L1213 558Q1187 464 1156 398Z",
  ],
  "肩": [
    "M758 226Q789 206 833 237L837 319Q805 354 764 345L726 302Z",
    "M1082 226Q1051 206 1007 237L1003 319Q1035 354 1076 345L1114 302Z",
  ],
  "腹筋・体幹": [],
  "脚": [
    "M797 511Q858 492 920 515L919 833L900 1047L891 1188L782 1188L787 1047L762 835Z",
    "M1043 511Q982 492 920 515L921 833L940 1047L949 1188L1058 1188L1053 1047L1078 835Z",
  ],
};

export function AnatomyFigure({ view, activity }: { view: "front" | "back"; activity: MuscleActivity }) {
  const maskId = `muscle-anatomy-${view}-mask`;
  const visibilityMaskId = `muscle-anatomy-${view}-visibility`;
  const edgeFilterId = `muscle-anatomy-${view}-edge`;
  const outlineFilterId = `muscle-anatomy-${view}-outline`;
  const clipId = `muscle-anatomy-${view}-clip`;
  const armClipId = `muscle-anatomy-${view}-arm-clip`;
  const regions = view === "front" ? frontRegions : backRegions;
  const viewBox = view === "front" ? "0 0 720 1280" : "560 0 720 1280";
  const visibleRegions = Object.entries(regions).flatMap(([group, paths]) => activity[group as MuscleGroup] > 0 ? paths : []);

  return <div className="rounded-xl border border-[#b7c8bb] bg-white px-2 pb-4 pt-4 text-center">
    <p className="text-sm font-bold tracking-[0.18em] text-[var(--ink)]">{view === "front" ? "正面" : "背面"}</p>
    <svg viewBox={viewBox} aria-hidden="true" className="mx-auto mt-2 aspect-[9/16] w-full max-w-[240px] -translate-x-2">
      <defs>
        <filter id={edgeFilterId} x="-1%" y="-1%" width="102%" height="102%">
          <feMorphology in="SourceAlpha" operator="erode" radius="2" result="clean-alpha" />
          <feComposite in="SourceGraphic" in2="clean-alpha" operator="in" />
        </filter>
        <filter id={outlineFilterId} x="-2%" y="-2%" width="104%" height="104%">
          <feMorphology in="SourceAlpha" operator="erode" radius="2" result="clean-alpha" />
          <feMorphology in="clean-alpha" operator="dilate" radius="6" result="outer-edge" />
          <feMorphology in="clean-alpha" operator="erode" radius="2" result="inner-edge" />
          <feComposite in="outer-edge" in2="inner-edge" operator="out" result="outline" />
          <feFlood floodColor="#b1c2b6" floodOpacity="0.8" result="outline-color" />
          <feComposite in="outline-color" in2="outline" operator="in" />
        </filter>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="1280" height="1280" style={{ maskType: "alpha" }}>
          <image href={anatomyImage.src} width="1280" height="1280" filter={`url(#${edgeFilterId})`} />
        </mask>
        <mask id={visibilityMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width="1280" height="1280" style={{ maskType: "luminance" }}>
          <rect width="1280" height="1280" fill="black" />
          {visibleRegions.map((d, index) => <path key={index} d={d} fill="white" />)}
        </mask>
        {/* The two inner hands overlap in the source image, so keep each torso and reflect its unobstructed outer forearm. */}
        <clipPath id={clipId}>
          <path d={view === "front" ? "M0 0H640V500H555L595 600V735H640V1280H0Z" : "M640 0H1280V1280H640V735H690V600L720 500H640Z"} />
        </clipPath>
        <clipPath id={armClipId}>
          <path d={view === "front" ? "M0 500H185L145 600V735H0Z" : "M1120 500H1280V735H1150V600Z"} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <image href={anatomyImage.src} width="1280" height="1280" filter={`url(#${outlineFilterId})`} />
        <image href={anatomyImage.src} width="1280" height="1280" filter={`url(#${edgeFilterId})`} mask={`url(#${visibilityMaskId})`} />
        <g mask={`url(#${maskId})`} style={{ mixBlendMode: "color" }}>
          {Object.entries(regions).flatMap(([group, paths]) => {
            const days = activity[group as MuscleGroup];
            if (!days || days >= 3) return [];
            const level = Math.min(days, 3);
            return paths.map((d, index) => <path key={`${group}-${index}`} d={d} fill={activityColors[level]} opacity={overlayOpacity[level]} />);
          })}
        </g>
      </g>
      <g transform={view === "front" ? "translate(740 0) scale(-1 1)" : "translate(1870 0) scale(-1 1)"}>
        <g clipPath={`url(#${armClipId})`}>
          <image href={anatomyImage.src} width="1280" height="1280" filter={`url(#${outlineFilterId})`} />
          <image href={anatomyImage.src} width="1280" height="1280" filter={`url(#${edgeFilterId})`} mask={`url(#${visibilityMaskId})`} />
          <g mask={`url(#${maskId})`} style={{ mixBlendMode: "color" }}>
            {activity["腕"] > 0 && activity["腕"] < 3 && <path d={view === "front" ? frontRegions["腕"][0] : backRegions["腕"][1]} fill={activityColors[activity["腕"]]} opacity={overlayOpacity[activity["腕"]]} />}
          </g>
        </g>
      </g>
    </svg>
  </div>;
}
