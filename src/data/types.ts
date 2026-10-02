export const PLACE_CATEGORIES = [
  'sit_down_food', 'casual_food', 'cafe_dessert', 'active_activity',
  'entertainment', 'shopping_walking', 'park_viewpoint',
] as const;
export type PlaceCategory = typeof PLACE_CATEGORIES[number];
export type DataStatus = 'verified' | 'estimated' | 'synthetic';
export const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type DayOfWeek = typeof DAYS[number];

export interface OpeningInterval {
  opens: string; // Local HH:mm, inclusive.
  closes: string; // Local HH:mm (or 24:00), exclusive.
}
export interface Place {
  readonly verification?: { readonly source_reference: string; readonly verified_at: string; readonly estimated_fields: readonly string[] };
  readonly place_id: string;
  readonly name: string;
  readonly category: PlaceCategory;
  readonly area: string;
  readonly address: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly estimated_cost_per_person: { readonly amount_cents: number; readonly currency: 'USD' };
  readonly typical_duration_minutes: number;
  readonly vibe_tags: readonly string[];
  readonly occasion_tags: readonly string[];
  readonly opening_hours: {
    readonly timezone: string;
    // [] = closed; null = unknown; multiple intervals allow split hours.
    readonly weekly: Readonly<Record<DayOfWeek, readonly OpeningInterval[] | null>>;
  };
  readonly group_size: {
    readonly min: number | null;
    readonly max: number | null;
    readonly recommended: number | null;
  } | null;
  readonly active: boolean;
  readonly data_status: DataStatus;
  readonly data_notes: string;
}

/** Filters combine with AND; tag lists match ANY tag within that list. */
export interface PlaceQuery {
  category?: PlaceCategory;
  area?: string;
  max_cost_per_person_cents?: number;
  vibe_tags_any?: readonly string[];
  occasion_tags_any?: readonly string[];
  group_size?: number;
  data_status?: DataStatus;
  include_inactive?: boolean; // False by default; true is for inspection only.
}

/** Consumers depend on this interface, never on the backing catalog file. */
export interface PlaceService {
  listActivePlaces(): Promise<readonly Place[]>;
  getPlaceById(placeId: string): Promise<Place | null>; // Includes inactive records for inspection.
  queryPlaces(query?: PlaceQuery): Promise<readonly Place[]>;
}
