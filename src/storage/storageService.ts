export interface StorageService {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class LocalStorageService implements StorageService {
  getItem(key: string): string | null {
    return window.localStorage.getItem(key);
  }
  setItem(key: string, value: string): void {
    window.localStorage.setItem(key, value);
  }
  removeItem(key: string): void {
    window.localStorage.removeItem(key);
  }
}

export const storageService: StorageService = new LocalStorageService();
