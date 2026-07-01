export function isGlobalCampusScope(campus?: string | null): boolean {
  const value = String(campus ?? '').trim();
  return value === '' || value === 'all';
}

export function canReadCampusScopedResource(sessionCampus: string, resourceCampus?: string | null): boolean {
  if (sessionCampus === 'all') return true;
  return isGlobalCampusScope(resourceCampus) || resourceCampus === sessionCampus;
}

export function canMutateCampusScopedResource(sessionCampus: string, resourceCampus?: string | null): boolean {
  if (sessionCampus === 'all') return true;
  return resourceCampus === sessionCampus;
}

export function filterCampusScopedResources<T extends { campus?: string | null }>(
  resources: T[],
  sessionCampus: string,
): T[] {
  return resources.filter((resource) => canReadCampusScopedResource(sessionCampus, resource.campus));
}
