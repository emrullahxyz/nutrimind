import { useEffect, useRef, useState } from "react";
import type { NavState, TabType, SubViewType, ModalType } from "../lib/navigation";
import { INITIAL_NAV_STATE } from "../lib/navigation";

export function useNavigation() {
  const [navState, setNavState] = useState<NavState>(INITIAL_NAV_STATE);
  const [showExitToast, setShowExitToast] = useState(false);
  const lastBackPressRef = useRef<number>(0);

  const navStateRef = useRef<NavState>(navState);
  navStateRef.current = navState;

  // Sayfa ilk yüklendiğinde kök durumu bir kez tanımla
  useEffect(() => {
    window.history.replaceState(INITIAL_NAV_STATE, "");
  }, []);

  // PopState (Geri tuşu / swipe back) dinleyicisi
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const state = e.state as NavState | null;
      const current = navStateRef.current;

      if (state && state.tab) {
        // En kök (daily) durumundayken tekrar geri basılırsa çift basma çıkış mantığını çalıştır
        if (
          state.tab === "daily" &&
          state.isRoot &&
          !state.subView &&
          !state.modal &&
          current.tab === "daily" &&
          !current.subView &&
          !current.modal
        ) {
          const now = Date.now();
          if (now - lastBackPressRef.current < 2000) {
            // Çıkışa izin ver
          } else {
            lastBackPressRef.current = now;
            window.history.pushState(INITIAL_NAV_STATE, "");
            setShowExitToast(true);
            setTimeout(() => setShowExitToast(false), 2000);
          }
          return;
        }

        setNavState({
          tab: state.tab,
          subView: state.subView || null,
          modal: state.modal || null,
          modalData: state.modalData || null,
          isRoot: !!state.isRoot,
        });
        return;
      }

      // Geçmiş state'i yoksa
      if (current.tab === "daily" && !current.subView && !current.modal) {
        const now = Date.now();
        if (now - lastBackPressRef.current < 2000) {
          // Çıkış
        } else {
          lastBackPressRef.current = now;
          window.history.pushState(INITIAL_NAV_STATE, "");
          setShowExitToast(true);
          setTimeout(() => setShowExitToast(false), 2000);
        }
      } else {
        const safeState: NavState = { tab: "daily", subView: null, modal: null, isRoot: true };
        setNavState(safeState);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const changeTab = (newTab: TabType) => {
    if (newTab !== navState.tab || navState.subView !== null || navState.modal !== null) {
      const newState: NavState = {
        tab: newTab,
        subView: null,
        modal: null,
        isRoot: newTab === "daily",
      };
      window.history.pushState(newState, "");
      setNavState(newState);
    }
  };

  const openSubView = (subView: SubViewType) => {
    const newState: NavState = {
      ...navState,
      subView,
      modal: null,
    };
    window.history.pushState(newState, "");
    setNavState(newState);
  };

  const closeSubView = () => {
    window.history.back();
  };

  const openModal = (modal: ModalType, modalData?: any) => {
    const newState: NavState = {
      ...navState,
      modal,
      modalData,
    };
    window.history.pushState(newState, "");
    setNavState(newState);
  };

  const closeModal = () => {
    window.history.back();
  };

  return {
    navState,
    showExitToast,
    changeTab,
    openSubView,
    closeSubView,
    openModal,
    closeModal,
  };
}
