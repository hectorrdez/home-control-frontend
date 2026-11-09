import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useApi } from "@/api/ApiContext";
import type { AlertRule, AlertRuleInput } from "@/api/types";
import { useLiveRefetch } from "./useLiveRefetch";

// Feature 128 (backend 012): notification rules, loaded once. Any load failure (including a backend without the
// endpoint) leaves status "unavailable" and the editor shows ALERTS UNAVAILABLE.
export type AlertRulesStatus = "loading" | "ready" | "unavailable";

export interface AlertRulesContextValue {
  status: AlertRulesStatus;
  rules: AlertRule[];
  // Resolve with the stored rule; reject (e.g. duplicate_rule) and leave the list unchanged.
  create: (input: AlertRuleInput) => Promise<void>;
  // Optimistic: the new rule shows at once; a rejected write restores this rule and rejects.
  update: (rule: AlertRule) => Promise<void>;
  // Optimistic: the rule disappears at once; a rejected delete puts it back and rejects.
  remove: (id: string) => Promise<void>;
}

const UNAVAILABLE: AlertRulesContextValue = {
  status: "unavailable",
  rules: [],
  create: () => Promise.reject(new Error("alert rules unavailable")),
  update: () => Promise.reject(new Error("alert rules unavailable")),
  remove: () => Promise.reject(new Error("alert rules unavailable")),
};

const AlertRulesContext = createContext<AlertRulesContextValue | null>(null);

export function AlertRulesProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [status, setStatus] = useState<AlertRulesStatus>("loading");
  const [rules, setRules] = useState<AlertRule[]>([]);
  const rulesRef = useRef(rules);
  useEffect(() => {
    rulesRef.current = rules;
  }, [rules]);

  useEffect(() => {
    let active = true;
    api.listAlertRules().then(
      (list) => {
        if (!active) return;
        setRules(list);
        setStatus("ready");
      },
      () => {
        if (active) setStatus("unavailable");
      },
    );
    return () => {
      active = false;
    };
  }, [api]);

  // Feature 138: another device changed a rule; a failed refetch keeps the current list.
  const reload = useCallback(() => api.listAlertRules().then(setRules), [api]);
  useLiveRefetch("alert_rules", reload);

  // Replaces the rule with the same id (optimistic value or stored answer).
  const swap = useCallback((next: AlertRule) => {
    setRules((current) => current.map((rule) => (rule.id === next.id ? next : rule)));
  }, []);

  const create = useCallback(
    (input: AlertRuleInput) => api.createAlertRule(input).then((stored) => setRules((current) => [...current, stored])),
    [api],
  );

  const update = useCallback(
    (rule: AlertRule) => {
      const { id, ...input } = rule;
      const previous = rulesRef.current.find((item) => item.id === id);
      swap(rule);
      return api.updateAlertRule(id, input).then(swap, (error: unknown) => {
        if (previous) swap(previous);
        throw error;
      });
    },
    [api, swap],
  );

  const remove = useCallback(
    (id: string) => {
      const previous = rulesRef.current.find((item) => item.id === id);
      setRules((current) => current.filter((rule) => rule.id !== id));
      return api.deleteAlertRule(id).catch((error: unknown) => {
        if (previous) setRules((current) => [...current, previous]);
        throw error;
      });
    },
    [api],
  );

  const value = useMemo<AlertRulesContextValue>(
    () => ({ status, rules, create, update, remove }),
    [status, rules, create, update, remove],
  );

  return <AlertRulesContext.Provider value={value}>{children}</AlertRulesContext.Provider>;
}

// Outside the provider (e.g. isolated component tests) the editor is simply unavailable.
export function useAlertRules(): AlertRulesContextValue {
  return useContext(AlertRulesContext) ?? UNAVAILABLE;
}
