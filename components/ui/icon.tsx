import type { SVGProps } from "react";

export type IconName =
  | "arrow-right"
  | "camera"
  | "check"
  | "chevron-right"
  | "dumbbell"
  | "home"
  | "leaf"
  | "lock"
  | "mail"
  | "more"
  | "plus"
  | "progress"
  | "scale"
  | "settings"
  | "sparkle"
  | "trash"
  | "user";

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
}

export function Icon({ name, className, ...props }: IconProps) {
  const common = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
    ...props,
  };

  const paths: Record<IconName, React.ReactNode> = {
    "arrow-right": <path d="M5 12h14m-6-6 6 6-6 6" />,
    camera: <><path d="M4 7h3l1.5-2h7L17 7h3v12H4z" /><circle cx="12" cy="13" r="3.4" /></>,
    check: <path d="m5 12 4.2 4.2L19 6.8" />,
    "chevron-right": <path d="m9 18 6-6-6-6" />,
    dumbbell: <><path d="M6 8v8m12-8v8M3.5 10v4m17-4v4M6 12h12" /><path d="M8 9v6m8-6v6" /></>,
    home: <><path d="m3 10 9-7 9 7v10H3z" /><path d="M9 20v-6h6v6" /></>,
    leaf: <><path d="M20 4C12.4 4 5 7.4 5 14.2c0 3.2 2.5 5.8 5.7 5.8C17.5 20 20 11.6 20 4Z" /><path d="M4 21c2.5-4.5 6.2-7.7 11-10" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    progress: <><path d="M5 20V10m7 10V4m7 16v-7" /><path d="M3 20h18" /></>,
    scale: <><path d="M5 20h14a2 2 0 0 0 2-2V8a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v10a2 2 0 0 0 2 2Z" /><path d="M9 9a3 3 0 0 1 6 0" /><path d="m12 9 1.5 2" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.04 1.56V20h-3v-.1A1.7 1.7 0 0 0 10.66 18a1.7 1.7 0 0 0-1.88.34l-.06.06L6.6 16.28l.06-.06A1.7 1.7 0 0 0 7 14.34a1.7 1.7 0 0 0-1.56-1.04h-.1v-3h.1A1.7 1.7 0 0 0 7 9.26a1.7 1.7 0 0 0-.34-1.88l-.06-.06L8.72 5.2l.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.04-1.56V4h3v.1A1.7 1.7 0 0 0 15.74 5.66a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06A1.7 1.7 0 0 0 19.4 9.3c.16.63.72 1.07 1.38 1.07h.1v3h-.1c-.66 0-1.22.44-1.38 1.07Z" /></>,
    sparkle: <path d="m12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4L12 3Zm6.5 12 0.6 2.4 2.4.6-2.4.6-.6 2.4-.6-2.4-2.4-.6 2.4-.6.6-2.4Z" />,
    trash: <><path d="M4 7h16m-10 4v6m4-6v6M9 7V4h6v3m-9 0 1 14h10l1-14" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>,
  };

  return <svg aria-hidden="true" {...common}>{paths[name]}</svg>;
}
