/** The screens of the game. */
export type Route = { screen: 'title' } | { screen: 'nights' } | { screen: 'night'; id: string };

export const TITLE: Route = { screen: 'title' };

/**
 * Reads the URL hash: `#/` is the title, `#/nights` the level select, `#/night/<id>` a level. Anything else,
 * including a level id that does not exist, is the title.
 */
export function parseRoute(hash: string, levelIds: readonly string[]): Route {
  const path = hash.replace(/^#/, '');
  if (path === '/nights') return { screen: 'nights' };
  const match = /^\/night\/([^/]+)$/.exec(path);
  if (match) {
    let id: string;
    try {
      id = decodeURIComponent(match[1]!);
    } catch {
      return TITLE;
    }
    if (levelIds.includes(id)) return { screen: 'night', id };
  }
  return TITLE;
}

/** The hash that shows a route. `parseRoute(hashFor(route))` gives the route back. */
export function hashFor(route: Route): string {
  switch (route.screen) {
    case 'title':
      return '#/';
    case 'nights':
      return '#/nights';
    case 'night':
      return `#/night/${encodeURIComponent(route.id)}`;
  }
}

export function sameRoute(a: Route, b: Route): boolean {
  return hashFor(a) === hashFor(b);
}
