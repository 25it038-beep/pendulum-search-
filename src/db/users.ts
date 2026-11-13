import { and, desc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import { savedResults, searchHistory, userPreferences, users } from './schema.ts';

export interface UserPreferenceInput {
  aiOverview?: boolean;
  aiModel?: string;
  resultLimit?: number;
  safeSearch?: boolean;
  locationEnabled?: boolean;
  city?: string;
  country?: string;
}

export interface SavedResultInput {
  url: string;
  title: string;
  snippet?: string;
  domain?: string;
  category?: string;
}

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string | null,
  photoUrl?: string | null
) {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName ?? null,
        photoUrl: photoUrl ?? null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          displayName: displayName ?? null,
          photoUrl: photoUrl ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed (getOrCreateUser):', error);
    throw new Error('Failed to synchronize user profile. Please try again later.', { cause: error });
  }
}

export async function getUserPreferences(uid: string) {
  try {
    const rows = await db
      .select({
        preferences: userPreferences,
      })
      .from(userPreferences)
      .innerJoin(users, eq(userPreferences.userId, users.id))
      .where(eq(users.uid, uid))
      .limit(1);

    return rows[0]?.preferences ?? null;
  } catch (error) {
    console.error('Database query failed (getUserPreferences):', error);
    throw new Error('Failed to load user preferences. Please try again later.', { cause: error });
  }
}

export async function upsertUserPreferences(
  userId: number,
  input: UserPreferenceInput
) {
  try {
    const values = {
      userId,
      aiOverview: input.aiOverview ?? true,
      aiModel: input.aiModel || 'auto',
      resultLimit: input.resultLimit ?? 20,
      safeSearch: input.safeSearch ?? true,
      locationEnabled: input.locationEnabled ?? true,
      city: input.city || 'Chennai',
      country: input.country || 'India',
      updatedAt: new Date(),
    };

    const result = await db
      .insert(userPreferences)
      .values(values)
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: {
          aiOverview: values.aiOverview,
          aiModel: values.aiModel,
          resultLimit: values.resultLimit,
          safeSearch: values.safeSearch,
          locationEnabled: values.locationEnabled,
          city: values.city,
          country: values.country,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed (upsertUserPreferences):', error);
    throw new Error('Failed to save user preferences. Please try again later.', { cause: error });
  }
}

export async function listUserSearchHistory(uid: string, limitCount = 25) {
  try {
    const rows = await db
      .select({
        id: searchHistory.id,
        query: searchHistory.query,
        category: searchHistory.category,
        createdAt: searchHistory.createdAt,
      })
      .from(searchHistory)
      .innerJoin(users, eq(searchHistory.userId, users.id))
      .where(eq(users.uid, uid))
      .orderBy(desc(searchHistory.createdAt))
      .limit(limitCount);

    return rows;
  } catch (error) {
    console.error('Database query failed (listUserSearchHistory):', error);
    throw new Error('Failed to fetch search history. Please try again later.', { cause: error });
  }
}

export async function recordUserSearchHistory(
  userId: number,
  query: string,
  category = 'All'
) {
  try {
    await db
      .delete(searchHistory)
      .where(and(eq(searchHistory.userId, userId), eq(searchHistory.query, query)));

    const inserted = await db
      .insert(searchHistory)
      .values({
        userId,
        query,
        category,
      })
      .returning();

    return inserted[0];
  } catch (error) {
    console.error('Database query failed (recordUserSearchHistory):', error);
    throw new Error('Failed to record search history. Please try again later.', { cause: error });
  }
}

export async function clearUserSearchHistory(userId: number) {
  try {
    await db.delete(searchHistory).where(eq(searchHistory.userId, userId));
  } catch (error) {
    console.error('Database query failed (clearUserSearchHistory):', error);
    throw new Error('Failed to clear search history. Please try again later.', { cause: error });
  }
}

export async function listSavedResults(uid: string, limitCount = 50) {
  try {
    const rows = await db
      .select({
        id: savedResults.id,
        url: savedResults.url,
        title: savedResults.title,
        snippet: savedResults.snippet,
        domain: savedResults.domain,
        category: savedResults.category,
        createdAt: savedResults.createdAt,
      })
      .from(savedResults)
      .innerJoin(users, eq(savedResults.userId, users.id))
      .where(eq(users.uid, uid))
      .orderBy(desc(savedResults.createdAt))
      .limit(limitCount);

    return rows;
  } catch (error) {
    console.error('Database query failed (listSavedResults):', error);
    throw new Error('Failed to fetch saved results. Please try again later.', { cause: error });
  }
}

export async function saveSearchResult(userId: number, item: SavedResultInput) {
  try {
    const result = await db
      .insert(savedResults)
      .values({
        userId,
        url: item.url,
        title: item.title,
        snippet: item.snippet || '',
        domain: item.domain || '',
        category: item.category || 'All',
      })
      .onConflictDoUpdate({
        target: [savedResults.userId, savedResults.url],
        set: {
          title: item.title,
          snippet: item.snippet || '',
          domain: item.domain || '',
          category: item.category || 'All',
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed (saveSearchResult):', error);
    throw new Error('Failed to save search result. Please try again later.', { cause: error });
  }
}

export async function removeSavedResult(userId: number, url: string) {
  try {
    await db
      .delete(savedResults)
      .where(and(eq(savedResults.userId, userId), eq(savedResults.url, url)));
  } catch (error) {
    console.error('Database query failed (removeSavedResult):', error);
    throw new Error('Failed to remove saved result. Please try again later.', { cause: error });
  }
}
