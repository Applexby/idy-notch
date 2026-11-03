const P: Record<string, string> = {
  play: "M8 5.5v13l10.5-6.5L8 5.5Z",
  pause: "M6.5 5h4v14h-4zM13.5 5h4v14h-4z",
  next: "M5.5 6v12l9-6-9-6ZM16 6h2.5v12H16z",
  prev: "M18.5 6v12l-9-6 9-6ZM5.5 6H8v12H5.5z",
  quote: "M5 7h14M5 12h10M5 17h7",
  gear: "M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Zm7.4 2.8c0-.5 0-.9-.1-1.3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.2-1.3L14.3 3h-4l-.4 2.4a7.6 7.6 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a8 8 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1c.7.6 1.4 1 2.2 1.3l.4 2.4h4l.4-2.4c.8-.3 1.5-.7 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.3Z",
  music: "M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  timer: "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-11v4l2.5 1.5M9.5 2.5h5",
  shelf: "M3 13l2.5-7h13L21 13M3 13v5a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-5M3 13h5l1 2h6l1-2h5",
  check: "M5 12.5l4.2 4.2L19 7",
  todo: "M4 6.5l1.5 1.5L8 5.5M4 12.5l1.5 1.5L8 11.5M4 18.5l1.5 1.5L8 17.5M11 7h9M11 13h9M11 19h9",
  note: "M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm9 0v4h4M8.5 12h7M8.5 16h5",
  alarm: "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-11v3.5l2.5 1.5M3 5l3-2.5M21 5l-3-2.5",
  headphones: "M4 15v-3a8 8 0 0 1 16 0v3M4 15a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2v-3Zm16 0a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2v-3Z",
  bolt: "M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z",
  battery: "M3 8h15a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Zm19 3v2",
  plus: "M12 5v14M5 12h14",
  x: "M6 6l12 12M18 6L6 18",
  reset: "M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4",
  trash: "M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5c2 .8 3 2.8 3 5.5",
  file: "M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm8 0v5h5",
  folder: "M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6Z",
  login: "M10 4H5v16h5M14 8l4 4-4 4M18 12H8",
  back: "M15 5l-7 7 7 7",
  left: "M15 6l-6 6 6 6",
  right: "M9 6l6 6-6 6",
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  pin: "M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5Zm3 10v6",
  bell: "M12 3a6 6 0 0 0-6 6v3.6L4.4 15a1 1 0 0 0 .8 1.6h13.6a1 1 0 0 0 .8-1.6L18 12.6V9a6 6 0 0 0-6-6Zm-2.5 15.5a2.5 2.5 0 0 0 5 0",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4.5l3 2",
  text: "M5 6h14M5 11h14M5 16h9",
  paste: "M9 4h6v3H9zM8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2M9 12h6M9 16h4",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  web: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3Z",
  rew: "M11.5 6v12L3 12l8.5-6ZM21 6v12l-8.5-6L21 6Z",
  ffw: "M12.5 6v12l8.5-6-8.5-6ZM3 6v12l8.5-6L3 6Z",
  lyrics: "M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm4.5 4.5v2a1.5 1.5 0 0 1-1.5 1.5M8.5 9.5h-1M14.5 9.5v2A1.5 1.5 0 0 1 13 13M14.5 9.5h-1",
  "vol-hi": "M4 9h3l5-4v14l-5-4H4V9Zm12 .5a3.5 3.5 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10",
  "vol-lo": "M4 9h3l5-4v14l-5-4H4V9Zm12 .5a3.5 3.5 0 0 1 0 5",
  "vol-off": "M4 9h3l5-4v14l-5-4H4V9Zm12 1 4 4m0-4-4 4",
  snooze: "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM9.5 10.5h5l-5 5h5",
};

export function Ico({ n, s = 18, w = 1.9, fill = false }: { n: string; s?: number; w?: number; fill?: boolean }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"} strokeWidth={w}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[n] ?? ""} /></svg>
  );
}

export const PAGE_ICON = { music: "music", focus: "timer", shelf: "shelf", tasks: "todo", notes: "note", reminders: "alarm" } as const;
