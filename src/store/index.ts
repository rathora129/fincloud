import { configureStore, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Notification, SessionUser } from "@/lib/types";

type SessionState = {
  user: SessionUser | null;
};

const sessionSlice = createSlice({
  name: "session",
  initialState: { user: null } as SessionState,
  reducers: {
    setUser(state, action: PayloadAction<SessionUser | null>) {
      state.user = action.payload;
    },
  },
});

type UiState = {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  searchOpen: boolean;
};

const uiSlice = createSlice({
  name: "ui",
  initialState: { sidebarCollapsed: false, mobileNavOpen: false, searchOpen: false } as UiState,
  reducers: {
    toggleSidebar(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    setSidebarCollapsed(state, action: PayloadAction<boolean>) {
      state.sidebarCollapsed = action.payload;
    },
    setMobileNav(state, action: PayloadAction<boolean>) {
      state.mobileNavOpen = action.payload;
    },
    setSearchOpen(state, action: PayloadAction<boolean>) {
      state.searchOpen = action.payload;
    },
  },
});

type NotificationsState = {
  items: Notification[];
};

const notificationsSlice = createSlice({
  name: "notifications",
  initialState: { items: [] } as NotificationsState,
  reducers: {
    setNotifications(state, action: PayloadAction<Notification[]>) {
      state.items = action.payload;
    },
    markRead(state, action: PayloadAction<string>) {
      const item = state.items.find((n) => n.id === action.payload);
      if (item) item.read = true;
    },
    markAllRead(state) {
      state.items = state.items.map((n) => ({ ...n, read: true }));
    },
  },
});

export const { setUser } = sessionSlice.actions;
export const { toggleSidebar, setSidebarCollapsed, setMobileNav, setSearchOpen } = uiSlice.actions;
export const { setNotifications, markRead, markAllRead } = notificationsSlice.actions;

export function makeStore(preloaded?: {
  user?: SessionUser | null;
  notifications?: Notification[];
}) {
  return configureStore({
    reducer: {
      session: sessionSlice.reducer,
      ui: uiSlice.reducer,
      notifications: notificationsSlice.reducer,
    },
    preloadedState: {
      session: { user: preloaded?.user ?? null },
      notifications: { items: preloaded?.notifications ?? [] },
      ui: { sidebarCollapsed: false, mobileNavOpen: false, searchOpen: false },
    },
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
