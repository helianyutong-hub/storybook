export interface User {
    id: string;
    name: string;
    method: 'phone' | 'wechat';
    identifier: string;
}
export interface StoredStory {
    id: string;
    userId: string;
    title: string;
    childName: string;
    tone: string;
    bgSound: string;
    duration: string;
    pageCount: number;
    createdAt: string;
    approved: boolean;
    data: unknown;
}
export interface Preferences {
    childName: string;
    characters: string[];
    lastParams: Record<string, unknown>;
}
export declare function findOrCreateUser(method: 'phone' | 'wechat', identifier: string, name?: string): User;
export declare function createToken(userId: string): string;
export declare function getUserByToken(token?: string): User | null;
export declare function upsertStory(story: StoredStory): StoredStory;
export declare function listStories(userId: string): StoredStory[];
export declare function getStory(id: string, userId: string): StoredStory | null;
export declare function deleteStory(id: string, userId: string): boolean;
export declare function getPreferences(userId: string): Preferences | null;
export declare function setPreferences(userId: string, prefs: Preferences): Preferences;
//# sourceMappingURL=store.d.ts.map