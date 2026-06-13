// Client-safe project metadata. This module is imported by the browser bundle,
// so it MUST NOT contain any tokens. Each repository's token is resolved
// server-side only in vite.config.ts, from FOODIME_TOKEN / SOUNDMADE_TOKEN /
// WEWAIVE_TOKEN / KIIBEE_TOKEN.

export type ProjectId = 'foodime' | 'soundmade' | 'wewaive' | 'kiibee';

export type Project = {
  name: string;
  repo: string; // "owner/repo"
};

export const PROJECTS: Record<ProjectId, Project> = {
  foodime: { name: 'Foodime', repo: 'FoodimeRepo/foodime' },
  soundmade: { name: 'Soundmade', repo: 'soundmade-com/soundmade' },
  wewaive: { name: 'WeWaive', repo: 'wewaive/wewaive' },
  kiibee: { name: 'Kiibee', repo: 'kiibee-app/kiibee' },
};
