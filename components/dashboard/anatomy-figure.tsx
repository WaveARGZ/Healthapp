import { activityTint } from "@/components/dashboard/activity-color";
import { muscleGroups, type MuscleActivity, type MuscleGroup } from "@/lib/workouts/muscle-activity";

type Region = { d: string; mirrored?: boolean };

// Each half is reflected around x=100 so the left and right outlines meet cleanly.
const frontRegions: Record<MuscleGroup, Region[]> = {
  "胸": [{ d: "M91 73Q78 72 69 86L75 108Q85 116 100 111V82Q96 77 91 73Z", mirrored: true }],
  "背中": [],
  "腕": [
    { d: "M55 91Q48 105 50 129L56 139Q67 125 70 99L67 89Z", mirrored: true },
    { d: "M50 129Q43 144 39 169L35 187L47 190Q52 162 57 137Z", mirrored: true },
    { d: "M35 187L47 190L44 206Q42 213 36 213Q29 210 31 200Z", mirrored: true },
  ],
  "肩": [{ d: "M91 59Q70 60 57 73Q49 81 55 92L69 98Q76 80 91 74Z", mirrored: true }],
  "腹筋・体幹": [{ d: "M75 109Q87 116 100 111Q113 116 125 109L127 151Q120 170 100 184Q80 170 73 151Z" }],
  "脚": [
    { d: "M73 181Q86 183 100 187L98 270Q88 281 78 270L69 211Z", mirrored: true },
    { d: "M78 270Q87 279 98 270L95 345Q89 353 80 344L75 310Z", mirrored: true },
    { d: "M80 344Q88 349 95 345L98 358Q99 366 91 368H68Q62 368 65 362Z", mirrored: true },
  ],
};

const backRegions: Record<MuscleGroup, Region[]> = {
  "胸": [],
  "背中": [
    { d: "M91 59Q78 65 69 83L75 117L81 145Q88 157 100 165V79Q94 67 91 59Z", mirrored: true },
    { d: "M81 143Q88 157 100 165Q112 157 119 143L127 180Q111 190 100 194Q89 190 73 180Z" },
  ],
  "腕": [
    { d: "M55 91Q48 104 50 129L56 139Q67 125 70 99L67 89Z", mirrored: true },
    { d: "M50 129Q42 147 39 169L35 187L47 190Q52 163 57 137Z", mirrored: true },
    { d: "M35 187L47 190L44 206Q42 213 36 213Q29 210 31 200Z", mirrored: true },
  ],
  "肩": [{ d: "M91 59Q70 60 57 73Q49 81 55 92L69 98Q76 80 91 74Z", mirrored: true }],
  "腹筋・体幹": [],
  "脚": [
    { d: "M73 181Q86 183 100 187L98 270Q88 281 78 270L69 211Z", mirrored: true },
    { d: "M78 270Q87 279 98 270L95 345Q89 353 80 344L75 310Z", mirrored: true },
    { d: "M80 344Q88 349 95 345L98 358Q99 366 91 368H68Q62 368 65 362Z", mirrored: true },
  ],
};

const frontDetails = [
  "M100 83V179", "M76 109Q87 105 100 111Q113 105 124 109",
  "M82 128Q91 132 100 129Q109 132 118 128",
  "M82 145Q91 149 100 146Q109 149 118 145",
  "M87 161Q94 164 100 162Q106 164 113 161",
  "M77 207Q88 218 97 220", "M78 265Q87 259 98 270",
  "M79 307Q88 311 96 307",
];

const backDetails = [
  "M100 79V164", "M73 92Q84 105 100 111Q116 105 127 92",
  "M77 115Q88 126 100 130Q112 126 123 115",
  "M81 145Q91 150 100 165Q109 150 119 145",
  "M74 203Q85 212 98 218", "M78 266Q87 260 98 270",
  "M79 307Q88 311 96 307",
];

export function AnatomyFigure({ view, activity }: { view: "front" | "back"; activity: MuscleActivity }) {
  const regions = view === "front" ? frontRegions : backRegions;
  const details = view === "front" ? frontDetails : backDetails;
  const outline = "#f2ebdc";

  return <div className="rounded-xl border border-[#37413d] bg-[#202624] px-2 pb-4 pt-4 text-center">
    <p className="text-sm font-bold tracking-[0.18em] text-[#f2ebdc]">{view === "front" ? "正面" : "背面"}</p>
    <svg viewBox="0 0 200 380" aria-hidden="true" className="mx-auto mt-2 w-full max-w-[220px]">
      <g stroke={outline} strokeWidth="2.1" strokeLinejoin="round" strokeLinecap="round">
        <ellipse cx="100" cy="31" rx="15" ry="20" fill="#ca8b80" />
        <path d="M91 49L91 60M109 49L109 60M91 60L100 73L109 60" fill="none" />
        {muscleGroups.flatMap((group) => regions[group].flatMap((region, index) => {
          const fill = activityTint(activity[group]).color;
          const key = `${group}-${index}`;
          if (!region.mirrored) return [<path key={key} d={region.d} fill={fill} />];
          return [
            <path key={`${key}-left`} d={region.d} fill={fill} />,
            <path key={`${key}-right`} d={region.d} fill={fill} transform="translate(200 0) scale(-1 1)" />,
          ];
        }))}
      </g>
      <g fill="none" stroke={outline} strokeWidth="1.3" strokeLinecap="round" opacity="0.75">
        {details.map((d, index) => <path key={index} d={d} />)}
        <path d="M38 195L37 207M43 195L42 207M162 195L163 207M157 195L158 207" />
      </g>
    </svg>
  </div>;
}
