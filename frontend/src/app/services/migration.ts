/**
 * MigrationService — one-time migration of localStorage farms to DynamoDB.
 *
 * Detects farms in localStorage, prompts the user, and POSTs each to the
 * backend /farms endpoint. Failed farms are retained in localStorage.
 */
import { FarmAPI } from './api';

const STORAGE_KEY = 'maize_platform_farms';

export interface MigrationResult {
  migrated: number;
  failed: { name: string; error: string }[];
}

export const MigrationService = {
  /** Check if there are farms in localStorage to migrate. */
  hasLocalFarms(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const farms = JSON.parse(raw);
      return Array.isArray(farms) && farms.length > 0;
    } catch {
      return false;
    }
  },

  /** Migrate localStorage farms to the server. Returns success/failure counts. */
  async migrate(): Promise<MigrationResult> {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { migrated: 0, failed: [] };

    let farms: any[];
    try {
      farms = JSON.parse(raw);
    } catch {
      return { migrated: 0, failed: [] };
    }

    let migrated = 0;
    const failed: MigrationResult['failed'] = [];
    const remaining: any[] = [];

    for (const farm of farms) {
      try {
        await FarmAPI.createFarm({
          name: farm.name,
          status: farm.status || 'pending',
          yield: farm.yield,
          area: farm.area,
          coordinates: farm.coordinates,
          center: farm.center,
          confidence: farm.confidence,
          year: farm.year,
          analyses: farm.analyses,
        });
        migrated++;
      } catch (err: any) {
        failed.push({ name: farm.name || farm.id || 'Unknown', error: err.message });
        remaining.push(farm);
      }
    }

    // Keep only failed farms in localStorage
    if (remaining.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
    } else {
      MigrationService.clearLocalFarms();
    }

    return { migrated, failed };
  },

  /** Remove all farm data from localStorage. */
  clearLocalFarms(): void {
    localStorage.removeItem(STORAGE_KEY);
  },
};
