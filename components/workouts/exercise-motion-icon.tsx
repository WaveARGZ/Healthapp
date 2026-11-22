import type { ReactNode } from "react";
import { getExerciseMotion, type ExerciseMotion, type ExerciseIconEquipment } from "@/lib/workouts/exercise-motions";
import type { WorkoutExerciseCategory } from "@/types/workout-preferences";

type Point = readonly [number, number];

function Person({ head, body }: { head: Point; body: string }) {
  return <g strokeWidth="2.8"><path d={body} /><circle cx={head[0]} cy={head[1]} r="4.1" fill="var(--sage-soft)" /></g>;
}

function Equipment({ children }: { children: ReactNode }) {
  return <g stroke="var(--muted)" strokeWidth="1.9" opacity=".8">{children}</g>;
}

function Ghost({ d }: { d: string }) {
  return <path d={d} stroke="var(--sage-deep)" strokeWidth="2" strokeDasharray="3 3" opacity=".28" />;
}

function Arrow({ from, to }: { from: Point; to: Point }) {
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  const ux = dx / length, uy = dy / length;
  const backX = to[0] - 4 * ux, backY = to[1] - 4 * uy;
  const d = "M" + from.join(" ") + " L" + to.join(" ") + " M" + (backX - 2.5 * uy) + " " + (backY + 2.5 * ux) + " L" + to.join(" ") + " L" + (backX + 2.5 * uy) + " " + (backY - 2.5 * ux);
  return <path d={d} stroke="var(--sage-deep)" strokeWidth="2.2" />;
}

function Load({ equipment, at, angle = 0, narrow = false, bent = false }: { equipment: ExerciseIconEquipment; at: Point; angle?: number; narrow?: boolean; bent?: boolean }) {
  const bar = equipment === "barbell" || equipment === "smith";
  if (!bar && equipment !== "dumbbell") return null;
  const half = bar ? 19 : 6;
  return <g transform={"translate(" + at.join(" ") + ") rotate(" + angle + ")"} stroke="var(--muted)" strokeWidth="2.2">
    <path d={(bent ? "M-21 0h8l5-3 5 6h6l5-6 5 3h8" : "M" + (-half - 2) + " 0 H" + (half + 2)) + " M" + (-half) + " -4 V4 M" + half + " -4 V4"} />
    {bar && <path d={"M" + (-half + 3) + " -5 V5 M" + (half - 3) + " -5 V5"} />}
    {narrow && <path d="M-4-2v4m8-4v4" stroke="var(--ink-soft)" />}
  </g>;
}

function Hold() {
  return <g stroke="var(--sage-deep)" strokeWidth="2.2"><path d="M79 24v8m6-8v8" /></g>;
}

function Movement({ motion: m }: { motion: ExerciseMotion }) {
  const v = m.variant, e = m.equipment;
  switch (m.kind) {
    case "bench-press":
      return v === "incline" ? <>
        <Equipment><path d="M16 38 54 56H69M27 45v28m33-17v17" /></Equipment>
        <Ghost d="M26 38 40 47 44 34" />
        <Person head={[19, 31]} body="M25 38 51 52 64 59 68 71h9 M27 39 30 24 31 12" />
        <Load equipment={e} at={[31, 11]} /><Arrow from={[50, 34]} to={[50, 16]} />
      </> : <>
        <Equipment><path d="M12 49H65M22 50v23m37-23v23" />{e === "smith" && <path d="M17 11v61m51-61v61M13 11h8m43 0h8" />}</Equipment>
        <Ghost d={v === "narrow" ? "M29 44 36 47 39 35" : "M29 44 44 47 45 35"} />
        <Person head={[18, 42]} body="M25 44H51L65 59v12h10 M29 44 33 29 36 15" />
        <Load equipment={e} at={[36, 14]} narrow={v === "narrow"} /><Arrow from={[76, 39]} to={[76, 18]} />
      </>;
    case "seated-press":
      return <>
        <Equipment><path d={v === "incline" ? "M20 23 35 55h15M31 55v18m48-56v56M74 17h10v39H74z" : "M23 22v33h25M32 55v18m48-56v56M74 17h10v39H74z"} /></Equipment>
        <Ghost d="M34 30 28 42 42 40" />
        <Person head={v === "incline" ? [28, 15] : [33, 16]} body={v === "incline" ? "M30 24 39 52H57v19h9 M31 28 46 25 61 15" : "M33 25v27h23v19h9 M33 30 49 30 65 30"} />
        <Equipment><path d={v === "incline" ? "M58 13 64 18m-2-3 17 5" : "M65 26v8m0-4h14"} /></Equipment>
        <Arrow from={v === "incline" ? [48, 39] : [48, 20]} to={v === "incline" ? [63, 24] : [68, 20]} />
      </>;
    case "fly":
      return <>
        <Equipment>{v === "lying" ? <rect x="37" y="12" width="22" height="57" rx="3" /> : e === "machine" ? <><path d="M24 68V20m48 48V20M33 55h30" /><rect x="38" y="25" width="20" height="29" rx="3" /></> : <path d="M8 13v47m80-47v47M8 16 40 35m48-19L56 35" />}</Equipment>
        <Ghost d="M42 29 27 34 14 25 M54 29 69 34 82 25" />
        <Person head={[48, 16]} body="M48 25v27m0 0L38 71m10-19 10 19 M42 29 30 40 40 35 M54 29 66 40 56 35" />
        <Load equipment={e} at={[40, 35]} /><Load equipment={e} at={[56, 35]} />
        <Arrow from={[18, 19]} to={[34, 25]} /><Arrow from={[78, 19]} to={[62, 25]} />
      </>;
    case "push-up":
      if (v === "wall") return <>
        <Equipment><path d="M15 9v64m-4-55h4m-4 12h4m-4 12h4m-4 12h4" /></Equipment>
        <Ghost d="M31 26 44 48 55 71 M31 28 25 38 17 30" />
        <Person head={[39, 18]} body="M43 26 53 48 63 71h10 M43 29 30 31 17 30" />
        <Arrow from={[24, 49]} to={[37, 49]} />
      </>;
      if (v === "incline") return <>
        <Equipment><path d="M10 43h23M14 43v30m15-30v30" /></Equipment>
        <Ghost d="M32 35 56 53 79 70 M32 35 35 44 25 43" />
        <Person head={[34, 22]} body="M40 30 63 49 82 70h6 M40 30 31 37 25 43" />
        <Arrow from={[52, 36]} to={[57, 24]} />
      </>;
      if (v === "pike") return <>
        <Ghost d="M29 54 51 29 82 70 M29 54 35 64 23 70" />
        <Person head={[25, 47]} body="M31 42 52 20 69 48 83 70h5 M31 42 26 56 23 70" />
        <Arrow from={[13, 61]} to={[18, 43]} />
      </>;
      return <>
        <Ghost d="M26 54 56 61 80 68 M27 53 40 61 31 71" />
        <Person head={[21, 34]} body={v === "knee" ? "M28 40 54 56 75 70 86 58 M28 40 29 55 31 71" : "M28 40 56 48 81 56 86 71 M28 40 29 55 31 71"} />
        {v === "narrow" && <Equipment><path d="M31 71h6m-3-2v4" /></Equipment>}
        <Arrow from={[15, 61]} to={[15, 44]} />
      </>;
    case "dip":
      return <>
        <Equipment><path d="M19 38h14m30 0h14M24 38v34m48-34v34" /></Equipment>
        <Ghost d="M48 35v25m-8-23L29 49 24 38m32-1 11 12 5-11" />
        <Person head={v === "lean" ? [42, 15] : [48, 15]} body={v === "lean" ? "M44 24 49 47 59 58 69 57 M42 27 29 35 24 38 M49 28 62 35 72 38" : "M48 24v25l11 10 10-2 M42 28 30 32 24 38 M54 28 66 32 72 38"} />
        <Arrow from={[83, 51]} to={[83, 30]} />
      </>;
    case "pull-down":
      return <>
        <Equipment><path d="M12 71V8h36v28M9 71h10m14-13h30m-15 0v15M24 36h48" /></Equipment>
        <Ghost d="M42 33 29 24 24 10h48M54 33 67 24 72 10" />
        <Person head={[48, 20]} body="M48 29v27m0 0L35 71m13-15 13 15 M42 33 30 46 24 36 M54 33 66 46 72 36" />
        <Arrow from={[83, 12]} to={[83, 34]} />
      </>;
    case "straight-pull":
      return <>
        <Equipment><path d="M13 10v62h10M13 10 43 54" /></Equipment>
        <Ghost d="M40 28 32 19 24 16" />
        <Person head={[36, 16]} body="M40 25 54 48 47 62 52 72h8 M54 48 64 62 72 72h6 M40 28 41 41 43 54" />
        <Equipment><path d="M38 54h10" /></Equipment><Arrow from={[23, 29]} to={[30, 48]} />
      </>;
    case "seated-row":
      return <>
        <Equipment><path d="M21 55h23m-17 0v18m12-18v18M76 68h12V25H76z" />{e === "cable" ? <path d="M48 41 80 56m-7 9 8-13" /> : <path d="M46 40h31m-32-12v20" />}</Equipment>
        <Ghost d="M34 30 55 34 73 36" />
        <Person head={[34, 17]} body="M34 26v26h25l14 18h9 M34 30 28 43 48 41" />
        <Equipment><path d="M48 37v8" /></Equipment><Arrow from={[70, 19]} to={[49, 19]} />
      </>;
    case "bent-row":
      return <>
        {v === "one-arm" && <Equipment><path d="M14 51h48m-42 0v22m36-22v22" /></Equipment>}
        {v === "supported" && <Equipment><path d="M27 31 62 53m-30-19v39m26-23v23" /></Equipment>}
        <Ghost d="M39 32 35 49 33 64" />
        <Person head={[27, 23]} body={v === "one-arm" ? "M34 30 65 42 68 61 78 71h7 M65 42 55 50 M34 30 23 49 M40 33 57 35 51 47" : "M34 30 64 43 61 59 69 71h8 M64 43 45 58 39 71h7 M39 33 53 35 46 48"} />
        <Load equipment={e} at={v === "one-arm" ? [51, 48] : [46, 49]} /><Arrow from={[20, 61]} to={[25, 43]} />
      </>;
    case "pull-up":
      return <>
        <Equipment><path d="M15 72V16h66v56M11 72h8m58 0h8" />{v === "assisted" && <><rect x="40" y="57" width="22" height="5" rx="2" /><path d="M86 27v41h6V27z" /></>}</Equipment>
        <Ghost d="M48 43v21 M42 41 29 29 26 16 M54 41 67 29 70 16" />
        <Person head={[48, 10]} body="M48 19v29l9 12 12 3 M42 24 29 34 26 16 M54 24 67 34 70 16" />
        {v === "underhand" && <Equipment><path d="m23 20 6-4m38 0 6 4" /></Equipment>}
        <Arrow from={[86, 48]} to={[86, 27]} />
      </>;
    case "hinge":
      return <>
        <Ghost d="M61 21 62 42M58 27 52 48" />
        <Person head={[27, 23]} body={v === "deadlift" ? "M34 29 53 44 33 57 25 71h9 M53 44 62 59 72 71h8 M34 31 33 46 33 59" : "M34 29 64 42 58 60 67 71h10 M64 42 49 59 41 71h9 M34 31 33 46 33 59"} />
        <Load equipment={e} at={[33, 61]} /><Arrow from={[78, 54]} to={[78, 33]} />
      </>;
    case "back-extension":
      return <>
        <Equipment><path d="m42 50 19-8m-8 5-17 25h45M57 48l18 21m-5-9 12 2" /></Equipment>
        <Ghost d="M54 45 42 58 42 65" />
        <Person head={[29, 22]} body="M35 29 55 46 70 60 80 68 M36 33 46 41 42 35" />
        <Arrow from={[23, 54]} to={[23, 34]} />
      </>;
    case "bird-dog":
      return <>
        <Ghost d="M32 39 19 56 M61 41 68 60" />
        <Person head={[23, 31]} body="M29 38 60 41 86 34 M32 39 32 70h12 M31 39 12 37 M60 41 64 69h18" />
        <Arrow from={[70, 25]} to={[86, 25]} /><Arrow from={[26, 25]} to={[12, 25]} />
      </>;
    case "superman":
      return <>
        <Ghost d="M13 67 34 64H61l25 3" />
        <Person head={[24, 45]} body="M31 50 59 52 84 42 M34 51 14 39" />
        <Arrow from={[13, 61]} to={[13, 47]} /><Arrow from={[84, 63]} to={[84, 49]} />
      </>;
    case "curl":
      if (v === "preacher") return <>
        <Equipment><path d="m41 37 29 10m-15-5v30M19 54h22m-17 0v18M75 52v20h9V52z" /></Equipment>
        <Ghost d="M36 28 52 40 75 53" />
        <Person head={[31, 15]} body="M33 24v28h21l6 20h9 M36 28 52 40 64 25" />
        <Equipment><path d="m61 23 6 4" /></Equipment><Arrow from={[81, 45]} to={[74, 28]} />
      </>;
      if (v === "incline") return <>
        <Equipment><path d="m30 20 23 35h15m-32-29v46m25-17v17" /></Equipment>
        <Ghost d="M43 30 36 45 33 61" />
        <Person head={[37, 13]} body="M41 22 55 52h12l7 20h9 M43 30 36 46 47 33" />
        <Load equipment={e} at={[47, 32]} /><Arrow from={[22, 57]} to={[25, 37]} />
      </>;
      return <>
        {e === "cable" && <Equipment><path d="M12 53v20h10M12 68 38 24" /></Equipment>}
        {e === "towel" && <Equipment><path d="M38 24 45 69 58 24M39 72h15" /></Equipment>}
        <Ghost d="M41 31 34 48 33 63 M55 31 62 48 63 63" />
        <Person head={[48, 16]} body="M48 25v27m0 0L37 72h8m3-20 11 20h8 M41 31 30 45 38 24 M55 31 66 45 58 24" />
        {e === "barbell" ? <Load equipment={e} at={[48, 24]} bent={v === "neutral"} /> : <><Load equipment={e} at={[38, 24]} angle={v === "neutral" ? 90 : 0} /><Load equipment={e} at={[58, 24]} angle={v === "neutral" ? 90 : 0} /></>}
        <Arrow from={[19, 56]} to={[19, 35]} />
      </>;
    case "triceps":
      if (v === "kickback") return <>
        <Ghost d="M50 36 59 39 57 57" />
        <Person head={[25, 23]} body="M32 30 63 43 59 61 68 72h8 M63 43 42 59 35 72h8 M43 34 58 38 79 39" />
        <Load equipment={e} at={[79, 39]} /><Arrow from={[67, 53]} to={[80, 46]} />
      </>;
      if (v === "overhead") return <>
        {e === "cable" && <Equipment><path d="M14 20v52h10M14 68 48 8" /></Equipment>}
        <Ghost d="M41 32 34 18 48 29 M55 32 62 18 48 29" />
        <Person head={[48, 24]} body="M48 33v22m0 0L36 72h9m3-17 12 17h8 M41 34 39 20 48 8 M55 34 57 20 48 8" />
        <Load equipment={e} at={[48, 8]} /><Arrow from={[76, 34]} to={[76, 13]} />
      </>;
      return <>
        <Equipment><path d="M15 10v62h9M15 12 49 56m-7 0h14" /></Equipment>
        <Ghost d="M40 31 41 44 54 35" />
        <Person head={[44, 15]} body="M45 24 49 51 40 71h8m1-20 14 20h9 M40 31 41 44 49 56" />
        <Arrow from={[71, 36]} to={[71, 55]} />
      </>;
    case "shoulder-press":
      return <>
        {e === "machine" && <Equipment><path d="M27 72V23m42 49V23M35 55h26m-13 0v17M69 23h10V10H63" /></Equipment>}
        {v === "rotate" && <Equipment><path d="M36 33v22h24m-12 0v17" /></Equipment>}
        <Ghost d={v === "rotate" ? "M42 36 34 43 43 32 M54 36 62 43 53 32" : "M42 36 29 47 26 33 M54 36 67 47 70 33"} />
        <Person head={[48, 25]} body="M48 34v21m0 0L37 72h9m2-17 11 17h9 M42 36 34 24 34 10 M54 36 62 24 62 10" />
        {e === "barbell" ? <Load equipment={e} at={[48, 9]} /> : <><Load equipment={e} at={[34, 10]} /><Load equipment={e} at={[62, 10]} /></>}
        <Arrow from={[83, 40]} to={[83, 17]} />{v === "rotate" && <path d="M16 36q0-10 11-11m-4-2 4 2-2 4" stroke="var(--sage-deep)" />}
      </>;
    case "lateral-raise":
      return <>
        {e === "cable" && <Equipment><path d="M10 52v20h9M12 67 13 33" /></Equipment>}
        {e === "machine" && <Equipment><path d="M33 55h30m-15 0v18" /><rect x="20" y="30" width="11" height="6" rx="2" /><rect x="65" y="30" width="11" height="6" rx="2" /></Equipment>}
        <Ghost d={e === "machine" ? "M41 30 37 45 29 35 M55 30 59 45 67 35" : "M41 30 35 48 32 61 M55 30 61 48 64 61"} />
        <Person head={[48, 16]} body={e === "machine" ? "M48 25v27m0 0L37 60v12h8m3-20 11 8v12h8 M41 30 27 34 26 20 M55 30 69 34 70 20" : e === "cable" ? "M48 25v27m0 0L37 72h8m3-20 11 20h8 M41 30 27 34 13 33 M55 30 61 48 64 61" : "M48 25v27m0 0L37 72h8m3-20 11 20h8 M41 30 27 34 13 33 M55 30 69 34 83 33"} />
        <Load equipment={e} at={[13, 33]} />{e !== "cable" && <Load equipment={e} at={[83, 33]} />}
        <Arrow from={[21, 55]} to={[16, 39]} />{e !== "cable" && <Arrow from={[75, 55]} to={[80, 39]} />}
      </>;
    case "rear-fly":
      return <>
        {e === "machine" && <Equipment><rect x="38" y="26" width="20" height="28" rx="3" /><path d="M32 56h32m-16 0v17M18 23v43m60-43v43" /></Equipment>}
        <Ghost d={v === "seated" ? "M40 35 38 48 40 61 M56 35 58 48 56 61" : "M41 35 39 50 38 61 M46 37 51 52 52 62"} />
        <Person head={v === "seated" ? [48, 15] : [37, 27]} body={v === "seated" ? "M48 24v29m0 0L36 72h8m4-19 12 19h8 M41 30 27 33 13 32 M55 30 69 33 83 32" : "M42 35 57 51 46 71h8 M57 51 68 71h8 M41 35 26 40 13 36 M46 37 67 29 82 28"} />
        <Load equipment={e} at={[13, v === "seated" ? 32 : 36]} /><Load equipment={e} at={[v === "seated" ? 83 : 82, v === "seated" ? 32 : 28]} />
        <Arrow from={[34, 24]} to={[17, 24]} /><Arrow from={[62, 24]} to={[79, 24]} />
      </>;
    case "face-pull":
      return <>
        <Equipment><path d="M85 11v61h-9M85 24H32m-2-3 4 6" /></Equipment>
        <Ghost d="M30 31 52 29 74 25" />
        <Person head={[29, 17]} body="M30 26v28m0 0L20 72h8m2-18 15 18h8 M30 31 46 34 32 24" />
        <Arrow from={[72, 13]} to={[48, 13]} />
      </>;
    case "crunch":
      if (e === "machine") return <>
        <Equipment><path d="M56 21v34H40m17 0v18M79 25v45h9V25zM42 34l12 7" /></Equipment>
        <Ghost d="M54 22v31 M49 26 43 37" />
        <Person head={[33, 31]} body="M39 39Q38 49 53 53h17l5 19h10 M41 40 45 30 51 35" />
        <Arrow from={[24, 19]} to={[24, 37]} />
      </>;
      if (e === "cable") return <>
        <Equipment><path d="M15 9v64h10M15 9 38 34" /></Equipment>
        <Ghost d="M54 23v29 M50 27 41 19" />
        <Person head={[34, 37]} body="M40 44Q39 50 53 53L66 70h18 M42 44 35 30 39 28" />
        <Arrow from={[25, 22]} to={[25, 38]} />
      </>;
      return <>
        <Ghost d="M18 65H56" />
        <Person head={[29, 37]} body="M35 44Q44 59 57 62L72 48 82 72h7 M36 46 48 45 43 53" />
        <Arrow from={[17, 59]} to={[22, 43]} />
      </>;
    case "plank":
      return <><Person head={[23, 36]} body="M30 43 55 50 80 58 85 71 M32 44 30 71h18" /><Hold /></>;
    case "side-plank":
      return <><Person head={[22, 29]} body="M29 36 54 50 80 64 85 71 M30 37 23 70h16 M32 37 35 16" /><Hold /></>;
    case "dead-bug":
      return <>
        <Ghost d="M55 64 62 40 77 40 M31 61 35 38" />
        <Person head={[18, 57]} body="M26 63H54L84 62 M54 63 67 43 83 46 M30 61 15 38 M33 61 40 39" />
        <Arrow from={[71, 53]} to={[83, 59]} /><Arrow from={[27, 31]} to={[15, 31]} />
      </>;
    case "side-crunch":
      return <>
        <Ghost d="M18 65H56" />
        <Person head={[29, 39]} body="M36 46Q43 59 56 61L70 60 82 72 M56 64h15l8 8 M36 48 47 42 44 53" />
        <path d="M16 59q-3-15 7-22m-4 0h4v4" stroke="var(--sage-deep)" />
      </>;
    case "reverse-crunch":
      return <>
        <Ghost d="M53 65 77 48 86 58" />
        <Person head={[18, 57]} body="M26 64H45Q55 61 56 52L48 35 65 33 M29 65 43 71" />
        <Arrow from={[78, 60]} to={[68, 40]} />
      </>;
    case "leg-raise":
      return <>
        <Ghost d="M53 64H86" />
        <Person head={[18, 57]} body="M26 64H52L72 25l7-5 M53 65 76 27 M30 65 45 70" />
        <Arrow from={[85, 56]} to={[81, 35]} />
      </>;
    case "hanging-knee":
      return <>
        <Equipment><path d="M16 10h64m-64 0v13m64-13v13" /></Equipment>
        <Ghost d="M48 53v19m4-18 7 18" />
        <Person head={[48, 25]} body="M48 34v19l18-11 8 17 M48 53 62 45 68 61 M42 34 31 23 29 10 M54 34 65 23 67 10" />
        <Arrow from={[84, 64]} to={[84, 45]} />
      </>;
    case "rollout":
      return <>
        <Equipment><circle cx="20" cy="66" r="6" /><path d="M12 66h16" /></Equipment>
        <Ghost d="M59 28 67 48 M62 34 51 58" />
        <Person head={[32, 32]} body="M39 39 65 49 70 70h15 M40 40 29 51 20 64" />
        <Arrow from={[47, 62]} to={[31, 62]} />
      </>;
    case "pallof":
      return <>
        <Equipment><path d="M10 28v30m0-13h38" /></Equipment>
        <Ghost d="M42 33 42 40 48 36 M54 33 54 40 48 36" />
        <Person head={[48, 16]} body="M48 25v28m0 0L35 72h9m4-19 13 19h9 M42 33 37 40 47 46 M54 33 59 40 49 46" />
        <Arrow from={[72, 32]} to={[72, 48]} /><Arrow from={[28, 45]} to={[16, 45]} />
      </>;
    case "leg-press":
      return <>
        <Equipment><path d="m15 30 33 33m-29-28-8 38h51M73 15l15 15m-17-7 12 12" /></Equipment>
        <Ghost d="M48 58 49 36 71 38" />
        <Person head={[24, 29]} body="M31 38 48 58 64 41 78 25 M50 60 68 44 82 29 M33 42 30 54 40 55" />
        <Arrow from={[77, 51]} to={[87, 36]} />
      </>;
    case "leg-extension":
      return <>
        <Equipment><path d="M17 22v34h38m-31 0v17m24-17v17" /><rect x="73" y="48" width="7" height="7" rx="2" /></Equipment>
        <Ghost d="M52 53 56 71" />
        <Person head={[28, 14]} body="M28 23v29h24l28-2 7 5 M30 32 40 47 47 47" />
        <Arrow from={[74, 66]} to={[83, 52]} />
      </>;
    case "leg-curl":
      return v === "lying" ? <>
        <Equipment><path d="M13 50h65m-55 0v23m47-23v23" /><rect x="56" y="22" width="8" height="6" rx="2" /></Equipment>
        <Ghost d="M69 45h20" />
        <Person head={[20, 38]} body="M28 45H69L59 21l-7-4 M31 45 22 54h13" />
        <Arrow from={[85, 41]} to={[75, 25]} />
      </> : <>
        <Equipment><path d="M17 22v34h39m-31 0v17m23-17v17" /><rect x="39" y="48" width="18" height="5" rx="2" /><rect x="42" y="64" width="8" height="6" rx="2" /></Equipment>
        <Ghost d="M53 53H82" />
        <Person head={[28, 14]} body="M28 23v29h25l-9 16 8 4 M30 32 40 46 48 46" />
        <Arrow from={[79, 58]} to={[60, 69]} />
      </>;
    case "hip-adduction":
    case "hip-abduction": {
      const outward = m.kind === "hip-abduction";
      return <>
        <Equipment><path d="M32 21v31h32V21M48 52v21" /><path d={outward ? "M19 55v9m58-9v9" : "M37 55v9m22-9v9"} /></Equipment>
        <Ghost d={outward ? "M43 49v22m10-22v22" : "M43 49 26 60 21 71M53 49 70 60 75 71"} />
        <Person head={[48, 14]} body={outward ? "M48 23v25 M43 48 26 60 21 71h7 M53 48 70 60 75 71h7 M41 29 33 40 M55 29 63 40" : "M48 23v25 M43 48v23h7 M53 48v23h7 M41 29 33 40 M55 29 63 40"} />
        <Arrow from={outward ? [40, 45] : [25, 45]} to={outward ? [25, 45] : [40, 45]} /><Arrow from={outward ? [56, 45] : [71, 45]} to={outward ? [71, 45] : [56, 45]} />
      </>;
    }
    case "squat":
      if (v === "hack") return <>
        <Equipment><path d="m13 12 59 59m-52-59 59 59M25 24 53 52M60 73h29" /></Equipment>
        <Ghost d="M24 17 42 36 61 37 70 58" />
        <Person head={[31, 18]} body="M37 27 54 47h22l-5 24h12 M39 31 49 25 53 31" />
        <Arrow from={[24, 55]} to={[13, 43]} />
      </>;
      return <>
        {v === "chair" && <Equipment><path d="M14 33v22h28m-23 0v18m20-18v18" /></Equipment>}
        <Ghost d="M47 25 47 47 50 70" />
        <Person head={[53, 18]} body={v === "goblet" ? "M49 27 36 48 58 57 55 71h13 M40 49 62 58 61 71h13 M48 31 59 42 61 29" : "M49 27 36 48 58 57 55 71h13 M40 49 62 58 61 71h13 M49 31 67 35 76 28"} />
        <Load equipment={e} at={v === "goblet" ? [61, 30] : [49, 28]} angle={v === "goblet" ? 90 : 0} /><Arrow from={[82, 60]} to={[82, 38]} />
      </>;
    case "lunge":
      return <>
        {v === "bulgarian" && <Equipment><path d="M8 49h22m-17 0v24m12-24v24" /></Equipment>}
        <Ghost d="M48 24v22m0 0L65 67m-17-21-17 18" />
        <Person head={[47, 12]} body={v === "bulgarian" ? "M47 21v26h23l2 25h12 M47 47 32 65 20 47 M43 28 38 51 M51 28 57 51" : "M47 21v26h23l2 25h12 M47 47 28 67 13 72h8 M43 28 38 51 M51 28 57 51"} />
        <Load equipment={e} at={[38, 53]} angle={90} /><Load equipment={e} at={[57, 53]} angle={90} /><Arrow from={[85, 52]} to={[85, 32]} />
        {v !== "bulgarian" && <Arrow from={v === "reverse" ? [30, 76] : [55, 76]} to={v === "reverse" ? [15, 76] : [72, 76]} />}
      </>;
    case "step-up":
      return <>
        <Equipment><path d="M56 73V46h31v27" /></Equipment>
        <Ghost d="M40 32 34 55 28 72" />
        <Person head={[48, 12]} body="M47 21 42 46 65 40 76 46h7 M42 46 32 61 26 72h8 M47 27 62 30 69 22 M46 28 33 38 25 34" />
        <Arrow from={[84, 35]} to={[84, 18]} />
      </>;
    case "bridge":
      return <>
        {v === "bench" && <Equipment><path d="M10 47h25m-20 0v26m15-26v26" /></Equipment>}
        <Ghost d="M28 64H53L72 44" />
        <Person head={v === "bench" ? [18, 39] : [18, 59]} body={v === "bench" ? "M26 44h48l7 28h8 M28 44 36 54 49 45" : "M26 64 52 51 73 45 81 72h8 M28 65 43 71"} />
        <Load equipment={e} at={[53, 43]} /><Arrow from={[54, 66]} to={[54, 51]} />
      </>;
    case "calf-raise":
      return v === "seated" ? <>
        <Equipment><path d="M17 56h25m-19 0v17m15-17v17M78 25v47h9V25zM48 49h16M53 74h21" /></Equipment>
        <Ghost d="M57 65v7h13" />
        <Person head={[30, 15]} body="M30 24v29h27v12l-3 2 12 5h8 M32 33 43 45 50 44" />
        <Arrow from={[78, 65]} to={[78, 50]} />
      </> : <>
        <Ghost d="M45 72h17" />
        <Person head={[48, 12]} body="M48 21v27l-3 18 11 6h8 M45 48 44 65 M42 27 35 43 M54 27 61 43" />
        <Arrow from={[25, 65]} to={[25, 49]} />
      </>;
    case "wall-sit":
      return <>
        <Equipment><path d="M23 9v64m-5-51h5m-5 13h5m-5 13h5m-5 13h5" /></Equipment>
        <Person head={[31, 14]} body="M31 23v26h30v23h13 M32 30 44 44 54 44" /><Hold />
      </>;
    case "walk":
      return e === "machine" ? <>
        <Equipment><rect x="12" y="68" width="73" height="6" rx="3" /><path d="M77 68V23H65" /><rect x="72" y="13" width="15" height="10" rx="2" /></Equipment>
        <Person head={[43, 12]} body="M43 21v23l13 12 11 11 M43 44 32 56 23 67 M43 27 56 34 65 25 M43 27 31 37 25 32" />
        <Arrow from={[24, 61]} to={[41, 61]} />
      </> : <>
        <Person head={[48, 13]} body={v === "brisk" ? "M48 22v24l14 12 16 13h8 M48 46 34 58 21 72h8 M48 27 62 37 72 29 M48 27 32 35 24 24" : "M48 22v24l13 13 14 13h8 M48 46 35 60 26 72h7 M48 27 60 36 67 30 M48 27 37 37 30 30"} />
        <Arrow from={[66, 15]} to={[83, 15]} />
      </>;
    case "run":
      return <>
        <Person head={[55, 12]} body={v === "jog" ? "M52 21 48 44 62 48 59 66h8 M48 44 35 56 28 62 M52 27 64 34 71 26 M52 27 40 37 33 30" : "M52 21 48 44 67 42 61 61h9 M48 44 32 55 21 46 M52 27 66 33 75 23 M52 27 39 37 31 28"} />
        <Arrow from={[67, 11]} to={[85, 11]} />
      </>;
    case "bike":
      return <>
        <Equipment><circle cx="70" cy="59" r="12" /><circle cx="46" cy="59" r="4" /><path d="M18 73h67M32 68l6-27m-10 0h19M46 59h24l6-32h7M38 48 46 59 32 68" /></Equipment>
        <Person head={[53, 13]} body="M50 22 41 40 58 47 47 60 M41 40 32 52 43 60 M50 24 60 32 76 27" />
        <path d="M53 54q9 10-3 14m1-5-1 5 5-1" stroke="var(--sage-deep)" />
      </>;
    case "elliptical":
      return <>
        <Equipment><path d="M17 73h66M28 17l6 47m34-47-5 47" /><ellipse cx="32" cy="66" rx="12" ry="3" /><ellipse cx="66" cy="66" rx="12" ry="3" /></Equipment>
        <Person head={[48, 12]} body="M48 21v25L34 64 M48 46 64 64 M42 28 33 37 28 22 M54 28 63 37 68 22" />
        <Arrow from={[13, 54]} to={[13, 37]} /><Arrow from={[83, 35]} to={[83, 52]} />
      </>;
    case "rowing":
      return <>
        <Equipment><path d="M15 64h62m-53 0v9m44-9v9M74 50l7 14M43 43l40 6" /><rect x="35" y="57" width="14" height="5" rx="2" /><circle cx="85" cy="51" r="9" /></Equipment>
        <Ghost d="M60 33 52 55 67 43 78 59 M60 34 77 34" />
        <Person head={[31, 22]} body="M36 31 44 55 65 57 78 61 M36 35 25 46 43 43" />
        <Arrow from={[57, 16]} to={[37, 16]} />
      </>;
    case "ski":
      return <>
        <Equipment><path d="M15 10v52m0-52 25 45M9 73h25" /><circle cx="17" cy="62" r="9" /></Equipment>
        <Ghost d="M62 22 65 50 M61 26 48 12" />
        <Person head={[49, 23]} body="M54 32 65 51 56 64 62 73h9 M65 51 76 64 83 73h7 M54 34 46 47 40 55" />
        <Arrow from={[29, 29]} to={[29, 48]} />
      </>;
    case "march":
      return <>
        <Ghost d="M48 49 65 45 67 63" />
        <Person head={[48, 12]} body="M48 21v28L29 44v17h8 M48 49 58 72h8 M42 28 32 35 28 25 M54 28 63 42 68 38" />
        <Arrow from={[17, 60]} to={[17, 44]} /><Arrow from={[80, 45]} to={[80, 60]} />
      </>;
    case "stairs":
      return <>
        <Equipment><path d="M10 74h13V62h22V49h22V35h22" /></Equipment>
        <Person head={[54, 9]} body="M51 18 43 40 61 41 69 48 M43 40 27 54 34 61 M51 23 66 27 72 18 M51 24 37 34 28 29" />
        <Arrow from={[82, 29]} to={[87, 15]} />
      </>;
    case "side-step":
      return <>
        <Ghost d="M48 49 43 71m5-22 5 22" />
        <Person head={[48, 12]} body="M48 21v28L27 71h8 M48 49 68 71h8 M42 28 31 44 M54 28 65 44" />
        <Arrow from={[36, 16]} to={[18, 16]} /><Arrow from={[66, 65]} to={[52, 65]} />
      </>;
    case "jump-rope":
      return <>
        <Ghost d="M22 40Q48-5 74 40" />
        <Equipment><path d="M22 40Q9 67 48 71Q86 67 74 40" /></Equipment>
        <Person head={[48, 15]} body="M48 24v25l-6 15v4h6 M48 49l6 15v4h6 M42 29 31 43 22 40 M54 29 65 43 74 40" />
        <Arrow from={[87, 65]} to={[87, 49]} />
      </>;
    case "custom":
      return <>
        {m.category && m.category !== "有酸素" && <g fill="var(--sage-deep)" stroke="none" opacity=".16">
          {m.category === "腕" ? <><circle cx="30" cy="43" r="8" /><circle cx="66" cy="43" r="8" /></> : m.category === "脚" ? <><ellipse cx="40" cy="62" rx="6" ry="11" /><ellipse cx="56" cy="62" rx="6" ry="11" /></> : m.category === "肩" ? <><circle cx="40" cy="29" r="7" /><circle cx="56" cy="29" r="7" /></> : <circle cx="48" cy={m.category === "腹筋・体幹" ? 45 : 35} r="11" />}
        </g>}
        <Person head={[48, 14]} body="M48 23v29m0 0L36 72h8m4-20 12 20h8 M42 28 30 48 M54 28 66 48" />
      </>;
  }
}

/** Compact, original vector artwork: no image downloads, animation or canvas buffers. */
export function ExerciseMotionIcon({ name, category, className = "" }: { name: string; category?: WorkoutExerciseCategory | null; className?: string }) {
  const motion = getExerciseMotion(name, category);
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 96 80" data-exercise-motion={motion.kind}
    className={"shrink-0 text-[var(--ink-soft)] " + className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <title>{motion.action}</title>
    <rect x=".8" y=".8" width="94.4" height="78.4" rx="10" fill="var(--sage-soft)" stroke="var(--line)" strokeWidth="1" />
    <path d="M10 74H86" stroke="var(--muted)" strokeWidth="1.2" opacity=".3" />
    <Movement motion={motion} />
  </svg>;
}
