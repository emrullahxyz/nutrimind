export type TabType = "daily" | "history" | "aliases" | "settings";

export type SubViewType =
  | "profile"
  | "goals"
  | "macros"
  | "sync"
  | "notifications"
  | "export"
  | "backup"
  | null;

export type ModalType =
  | "addMeal"
  | "scan"
  | "exercise"
  | "merge"
  | "aliasForm"
  | "recipeBuilder"
  | "exportModal"
  | null;

export interface NavState {
  tab: TabType;
  subView: SubViewType;
  modal: ModalType;
  modalData?: any;
  isRoot?: boolean;
}

export const INITIAL_NAV_STATE: NavState = {
  tab: "daily",
  subView: null,
  modal: null,
  isRoot: true,
};
