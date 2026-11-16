const jar = new Map<string, string>();

export function __setCookie(name: string, value?: string | null) {
  if (value === undefined || value === null) jar.delete(name);
  else jar.set(name, value);
}

export function __clearCookies() {
  jar.clear();
}

export async function cookies() {
  return {
    get(name: string) {
      if (!jar.has(name)) return undefined;
      return { name, value: jar.get(name) };
    },
  };
}
