// Single source of truth for the projects a bug can be filed against.
// Used by the client (to render the dropdown) and by the /api/bugs route
// (to resolve a project id to a real owner/repo). The client only ever sends
// a project id; the server resolves it from this allowlist so arbitrary
// repositories can never be targeted.

export type ProjectId = 'foodime' | 'soundmade' | 'wewaive' | 'kiibee';

export type Project = {
  id: ProjectId;
  name: string;
  owner: string;
  repo: string;
};

export const PROJECTS: Project[] = [
  { id: 'foodime', name: 'Foodime', owner: 'FoodimeRepo', repo: 'foodime' },
  { id: 'soundmade', name: 'Soundmade', owner: 'soundmade-com', repo: 'soundmade-old' },
  { id: 'wewaive', name: 'WeWaive', owner: 'wewaive', repo: 'wewaive' },
  { id: 'kiibee', name: 'Kiibee', owner: 'kiibee-app', repo: 'kiibee' },
];

export function findProject(id: string | undefined): Project | undefined {
  return PROJECTS.find((p) => p.id === id);
}
