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

export function AnatomyFigure({ activity }: { activity: MuscleActivity }) {
  const maskId = "muscle-anatomy-mask";
  const edgeFilterId = "muscle-anatomy-edge";
  const outlineFilterId = "muscle-anatomy-outline";
  const frontClipId = "muscle-anatomy-front-clip";
  const backClipId = "muscle-anatomy-back-clip";
  // The source figures overlap at the inner hands. Split them and leave space between the copies.
  const backOffset = 170;
  const figures = [
    { key: "front", clipId: frontClipId, visibilityMaskId: "muscle-anatomy-front-visibility", offset: 0, regions: frontRegions },
    { key: "back", clipId: backClipId, visibilityMaskId: "muscle-anatomy-back-visibility", offset: backOffset, regions: backRegions },
  ];

  return <div className="rounded-xl border border-[#b7c8bb] bg-white px-3 pb-4 pt-4 text-center">
    <div className="mx-auto grid max-w-[640px] grid-cols-2 text-sm font-bold tracking-[0.18em] text-[var(--ink)]">
      <p>正面</p><p>背面</p>
    </div>
    <svg viewBox="-16 -16 1482 1312" aria-hidden="true" className="mx-auto mt-2 aspect-[1482/1312] w-full max-w-[640px]">
      <defs>
        <clipPath id={frontClipId}><path d="M0 0H650V500H690V740H650V1280H0Z" /></clipPath>
        <clipPath id={backClipId}><path d="M650 0H1280V1280H650V740H610V500H650Z" /></clipPath>
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
        {figures.map((figure) => <mask key={figure.key} id={figure.visibilityMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width="1280" height="1280" style={{ maskType: "luminance" }}>
          <rect width="1280" height="1280" fill="black" />
          {Object.entries(figure.regions).flatMap(([group, paths]) => activity[group as MuscleGroup] > 0 ? paths : []).map((d, index) => <path key={index} d={d} fill="white" />)}
        </mask>)}
      </defs>
      {figures.map((figure) => <g key={figure.key} transform={`translate(${figure.offset} 0)`} clipPath={`url(#${figure.clipId})`}>
        <image href={anatomyImage.src} width="1280" height="1280" filter={`url(#${outlineFilterId})`} />
        <image href={anatomyImage.src} width="1280" height="1280" filter={`url(#${edgeFilterId})`} mask={`url(#${figure.visibilityMaskId})`} />
        <g mask={`url(#${maskId})`} style={{ mixBlendMode: "color" }}>
          {Object.entries(figure.regions).flatMap(([group, paths]) => {
            const days = activity[group as MuscleGroup];
            if (!days || days >= 3) return [];
            const level = Math.min(days, 3);
            return paths.map((d, index) => <path key={`${group}-${index}`} d={d} fill={activityColors[level]} opacity={overlayOpacity[level]} />);
          })}
        </g>
      </g>)}
    </svg>
  </div>;
}
