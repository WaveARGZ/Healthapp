import anatomyImage from "@/public/images/muscle-anatomy.png";
import type { MuscleActivity, MuscleGroup } from "@/lib/workouts/muscle-activity";
import { activityTint } from "@/components/dashboard/activity-color";

const frontRegions: Record<MuscleGroup, string[]> = {
  "胸": [
    "M211 247Q242 225 291 238Q326 232 360 234Q394 232 429 238Q478 225 509 247Q510 304 494 337Q464 363 419 361Q386 355 360 351Q334 355 301 361Q256 363 226 337Q210 304 211 247Z",
  ],
  "背中": [],
  "腕": [
    "M178 297Q220 283 251 324L231 416Q207 505 151 571L97 637L43 641L64 560Q106 486 137 407Z",
    "M542 297Q500 283 469 324L489 416Q513 505 569 571L623 637L677 641L656 560Q614 486 583 407Z",
    "M0 575H145V745H0Z",
  ],
  "肩": [
    "M329 173Q283 194 231 216Q192 227 182 260L211 271Q251 236 350 238L351 205Q344 186 329 173Z",
    "M391 173Q437 194 489 216Q528 227 538 260L509 271Q469 236 370 238L369 205Q376 186 391 173Z",
    "M249 229Q222 226 197 243Q178 264 182 301Q188 322 209 332Q238 316 262 281Q269 248 249 229Z",
    "M471 229Q498 226 523 243Q542 264 538 301Q532 322 511 332Q482 316 458 281Q451 248 471 229Z",
  ],
  "腹筋・体幹": ["M257 351Q302 361 360 358Q418 361 463 351L476 443Q476 498 453 553L422 592Q393 619 360 634Q327 619 298 592L267 553Q244 498 244 443Z"],
  "脚": [
    "M245 528Q226 564 218 605L204 688Q210 769 240 835L270 875L324 869Q344 817 349 759L355 636Q328 620 303 594L268 554Z",
    "M475 528Q494 564 502 605L516 688Q510 769 480 835L450 875L396 869Q376 817 371 759L365 636Q392 620 417 594L452 554Z",
    "M240 835Q278 859 324 850L334 1045L320 1192L220 1192L221 1056Z",
    "M480 835Q442 859 396 850L386 1045L400 1192L500 1192L499 1056Z",
    "M185 1150H550V1280H185Z",
  ],
};

const backRegions: Record<MuscleGroup, string[]> = {
  "胸": [],
  "背中": ["M920 177Q876 199 837 213Q811 226 791 248L794 335Q806 432 824 505Q868 536 920 560Q972 536 1016 505Q1034 432 1046 335L1049 248Q1029 226 1003 213Q964 199 920 177Z"],
  "腕": [
    "M749 302Q786 295 809 337L792 417Q759 507 706 578L667 646L613 643L627 558Q653 464 684 398Z",
    "M1091 302Q1054 295 1031 337L1048 417Q1081 507 1134 578L1173 646L1227 643L1213 558Q1187 464 1156 398Z",
    "M1120 565H1280V745H1120Z",
    "M600 565H760V745H600Z",
  ],
  "肩": [
    "M819 228Q785 220 757 242Q735 260 737 292Q743 320 766 330Q808 311 836 278Q838 245 819 228Z",
    "M1021 228Q1055 220 1083 242Q1105 260 1103 292Q1097 320 1074 330Q1032 311 1004 278Q1002 245 1021 228Z",
  ],
  "腹筋・体幹": [],
  "脚": [
    "M800 521Q841 502 888 520Q909 529 920 548L920 836L900 1047L891 1188L782 1188L787 1047L762 835L774 616Q782 551 800 521Z",
    "M1040 521Q999 502 952 520Q931 529 920 548L920 836L940 1047L949 1188L1058 1188L1053 1047L1078 835L1066 616Q1058 551 1040 521Z",
    "M740 1140H1105V1280H740Z",
  ],
};

export function AnatomyFigure({ view, activity }: { view: "front" | "back"; activity: MuscleActivity }) {
  const visibilityMaskId = `muscle-anatomy-${view}-visibility`;
  const edgeFilterId = `muscle-anatomy-${view}-edge`;
  const outlineFilterId = `muscle-anatomy-${view}-outline`;
  const clipId = `muscle-anatomy-${view}-clip`;
  const armClipId = `muscle-anatomy-${view}-arm-clip`;
  const regions = view === "front" ? frontRegions : backRegions;
  const viewBox = view === "front" ? "0 0 720 1280" : "560 0 720 1280";
  const headPath = view === "front" ? "M270 0H450V200H270Z" : "M835 0H1025V200H835Z";
  const hasActivity = Object.values(activity).some((days) => activityTint(days).opacity > 0);
  const visibleRegions = [
    ...(hasActivity ? [{ d: headPath, opacity: 1 }] : []),
    ...Object.entries(regions).flatMap(([group, paths]) => {
      const opacity = activityTint(activity[group as MuscleGroup]).opacity;
      return opacity > 0 ? paths.map((d) => ({ d, opacity })) : [];
    }),
  ];

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
        <mask id={visibilityMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width="1280" height="1280" style={{ maskType: "luminance" }}>
          <rect width="1280" height="1280" fill="black" />
          {visibleRegions.map(({ d, opacity }, index) => <path key={index} d={d} fill="white" opacity={opacity} />)}
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
      </g>
      <g transform={view === "front" ? "translate(734 0) scale(-1 1)" : "translate(1875 0) scale(-1 1)"}>
        <g clipPath={`url(#${armClipId})`}>
          <image href={anatomyImage.src} width="1280" height="1280" filter={`url(#${outlineFilterId})`} />
          <image href={anatomyImage.src} width="1280" height="1280" filter={`url(#${edgeFilterId})`} mask={`url(#${visibilityMaskId})`} />
        </g>
      </g>
    </svg>
  </div>;
}
