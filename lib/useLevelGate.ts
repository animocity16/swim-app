import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

export type LevelFeature =
  | "scan"
  | "settings"
  | "meets"
  | "standards"
  | "compare"
  | "follow_swimmer"
  | "brood";

// Which level unlocks each feature
const FEATURE_LEVELS: Record<LevelFeature, number> = {
  scan: 1,
  settings: 1,
  meets: 2,
  standards: 2,
  follow_swimmer: 3,
  compare: 3,
  brood: 4,
};

export interface LevelGate {
  isLegacy: boolean;
  userLevel: number;
  loading: boolean;
  canAccess: (feature: LevelFeature) => boolean;
  refreshLevel: () => Promise<void>;
}

export function useLevelGate(): LevelGate {
  const [isLegacy, setIsLegacy] = useState(false);
  const [userLevel, setUserLevel] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("profiles")
      .select("is_legacy_user, user_level")
      .eq("id", user.id)
      .single();

    if (data) {
      setIsLegacy(data.is_legacy_user ?? false);
      setUserLevel(data.user_level ?? 1);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const canAccess = (feature: LevelFeature): boolean => {
    if (isLegacy) return true;
    return userLevel >= FEATURE_LEVELS[feature];
  };

  return {
    isLegacy,
    userLevel,
    loading,
    canAccess,
    refreshLevel: fetchProfile,
  };
}