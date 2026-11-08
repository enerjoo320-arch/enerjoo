class SafeStorage {
  private isAvailable: boolean;
  private memoryStore: Record<string, string> = {};

  constructor() {
    try {
      const testKey = "__storage_test__";
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      this.isAvailable = true;
    } catch (e) {
      this.isAvailable = false;
      console.warn("localStorage is not available. Using in-memory storage fallback:", e);
    }
  }

  getItem(key: string): string | null {
    if (this.isAvailable) {
      try {
        return window.localStorage.getItem(key);
      } catch (e) {
        console.warn("Failed to get item from localStorage:", e);
      }
    }
    return this.memoryStore[key] || null;
  }

  setItem(key: string, value: string): void {
    if (this.isAvailable) {
      try {
        window.localStorage.setItem(key, value);
        return;
      } catch (e) {
        console.warn("Failed to set item in localStorage:", e);
      }
    }
    this.memoryStore[key] = value;
  }

  removeItem(key: string): void {
    if (this.isAvailable) {
      try {
        window.localStorage.removeItem(key);
        return;
      } catch (e) {
        console.warn("Failed to remove item from localStorage:", e);
      }
    }
    delete this.memoryStore[key];
  }

  clear(): void {
    if (this.isAvailable) {
      try {
        window.localStorage.clear();
        return;
      } catch (e) {
        console.warn("Failed to clear localStorage:", e);
      }
    }
    this.memoryStore = {};
  }
}

export const safeLocalStorage = new SafeStorage();
