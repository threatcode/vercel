import { join } from 'path';
import { existsSync } from 'fs';
import { pathToRegexp, Key } from 'path-to-regexp';
import type {
  ConfigRoute,
  RouteManifest,
} from '@remix-run/dev/dist/config/routes';
import type { BaseFunctionConfig } from '@vercel/static-config';

export interface ResolvedNodeRouteConfig {
  runtime: 'nodejs';
  regions?: string[];
  maxDuration?: number;
  memory?: number;
}
export interface ResolvedEdgeRouteConfig {
  runtime: 'edge';
  regions?: BaseFunctionConfig['regions'];
}

export type ResolvedRouteConfig =
  | ResolvedNodeRouteConfig
  | ResolvedEdgeRouteConfig;

export interface ResolvedRoutePaths {
  /**
   * The full URL path of the route, as will be shown
   * on the Functions tab in the deployment inspector.
   */
  path: string;
  /**
   * The full URL path of the route, but with syntax that
   * is compatible with the `path-to-regexp` module.
   */
  rePath: string;
}

const SPLAT_PATH = '/:params+';

const configExts = ['.js', '.cjs', '.mjs'];

export function findConfig(dir: string, basename: string): string | undefined {
  for (const ext of configExts) {
    const name = basename + ext;
    const file = join(dir, name);
    if (existsSync(file)) return file;
  }

  return undefined;
}

function isEdgeRuntime(runtime: string): boolean {
  return runtime === 'edge' || runtime === 'experimental-edge';
}

export function getResolvedRouteConfig(
  route: ConfigRoute,
  routes: RouteManifest,
  configs: Map<ConfigRoute, BaseFunctionConfig | null>
): ResolvedRouteConfig {
  let runtime: ResolvedRouteConfig['runtime'] | undefined;
  let regions: ResolvedRouteConfig['regions'];
  let maxDuration: ResolvedNodeRouteConfig['maxDuration'];
  let memory: ResolvedNodeRouteConfig['memory'];

  for (const currentRoute of getRouteIterator(route, routes)) {
    const staticConfig = configs.get(currentRoute);
    if (staticConfig) {
      if (typeof runtime === 'undefined' && staticConfig.runtime) {
        runtime = isEdgeRuntime(staticConfig.runtime) ? 'edge' : 'nodejs';
      }
      if (typeof regions === 'undefined') {
        regions = staticConfig.regions;
      }
      if (typeof maxDuration === 'undefined') {
        maxDuration = staticConfig.maxDuration;
      }
      if (typeof memory === 'undefined') {
        memory = staticConfig.memory;
      }
    }
  }

  if (Array.isArray(regions)) {
    regions = Array.from(new Set(regions)).sort();
  }

  if (runtime === 'edge') {
    return { runtime, regions };
  }

  if (regions && !Array.isArray(regions)) {
    throw new Error(
      `"regions" for route "${route.id}" must be an array of strings`
    );
  }

  return { runtime: 'nodejs', regions, maxDuration, memory };
}

export function calculateRouteConfigHash(config: ResolvedRouteConfig): string {
  const str = JSON.stringify(config);
  return Buffer.from(str).toString('base64url');
}

export function isLayoutRoute(
  routeId: string,
  routes: Pick<ConfigRoute, 'id' | 'parentId'>[]
): boolean {
  return routes.some(r => r.parentId === routeId);
}

export function* getRouteIterator(route: ConfigRoute, routes: RouteManifest) {
  let currentRoute: ConfigRoute = route;
  do {
    yield currentRoute;
    if (currentRoute.parentId) {
      currentRoute = routes[currentRoute.parentId];
    } else {
      break;
    }
  } while (currentRoute);
}

export function getPathFromRoute(
  route: ConfigRoute,
  routes: RouteManifest
): ResolvedRoutePaths {
  if (
    route.id === 'root' ||
    (route.parentId === 'root' && !route.path && route.index)
  ) {
    return { path: 'index', rePath: '/index' };
  }

  const pathParts: string[] = [];
  const rePathParts: string[] = [];

  for (const currentRoute of getRouteIterator(route, routes)) {
    if (!currentRoute.path) continue;

    pathParts.push(
      currentRoute.path.replace(/:(.+)\?/g, (_, name) => `(:${name})`)
    );

    rePathParts.push(currentRoute.path);
  }

  const path = pathParts.reverse().join('/');

  // Replace "/*" at the end to handle "splat routes"
  let rePath = rePathParts.reverse().join('/');
  rePath =
    rePath === '*' ? SPLAT_PATH : `/${rePath.replace(/\/\*$/, SPLAT_PATH)}`;

  return { path, rePath };
}

export function getRegExpFromPath(rePath: string): RegExp | false {
  const keys: Key[] = [];
  const re = pathToRegexp(rePath, keys);
  return keys.length > 0 ? re : false;
}
