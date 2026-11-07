import { useState } from "react";
import Button from "@components/controls/Button";
import Card from "@components/cards/Card";
import { useToast } from "@components/feedback/Toast";
import type { AlertLevel, AlertRule, AlertRuleInput, Entity } from "@/api/types";
import { triggerLabel, unitOf } from "@/features/alerts/rules";
import { useAlertRules } from "@/state/AlertRulesProvider";
import AlertLevelPicker from "./AlertLevelPicker";
import AlertRuleForm from "./AlertRuleForm";

// Feature 128: the ALERTS section of one entity on the device detail page. Rules save at once (level, delete);
// a failed write rolls back and shows a toast. Without the backend endpoint the section says ALERTS UNAVAILABLE.
const NOTICE = { loading: "LOADING ALERTS", unavailable: "ALERTS UNAVAILABLE" } as const;
const HEADING = "font-label-caps text-label-caps uppercase text-on-surface-variant";

export default function AlertRulesPanel({ entity }: { entity: Entity }) {
  const { status, rules, create, update, remove } = useAlertRules();
  const toast = useToast();
  const [adding, setAdding] = useState(false);

  if (status !== "ready") {
    return (
      <Card role="region" aria-label="Alerts" className="flex flex-col gap-space-sm">
        <h2 className={HEADING}>ALERTS</h2>
        <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">{NOTICE[status]}</p>
      </Card>
    );
  }

  const mine = rules.filter((rule) => rule.entityId === entity.entityId);
  const unit = unitOf(entity);

  const changeLevel = (rule: AlertRule, level: AlertLevel) => {
    if (rule.level === level) return;
    update({ ...rule, level }).catch(() => toast.show(`Could not change the alert on ${entity.name}`));
  };

  const deleteRule = (rule: AlertRule) => {
    remove(rule.id).catch(() => toast.show(`Could not delete the alert on ${entity.name}`));
  };

  // The form stays open on failure so the user can fix the trigger; it closes after a stored rule.
  const createRule = async (input: AlertRuleInput) => {
    await create(input);
    setAdding(false);
  };

  return (
    <Card role="region" aria-label="Alerts" className="flex flex-col gap-space-sm">
      <h2 className={HEADING}>ALERTS</h2>
      {mine.length === 0 && !adding && (
        <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">NO ALERTS</p>
      )}
      {mine.length > 0 && (
        <ul className="flex flex-col gap-space-sm">
          {mine.map((rule) => {
            const label = triggerLabel(rule.trigger, unit);
            return (
              <li key={rule.id} className="flex flex-col gap-space-xs border-t border-outline-variant/30 pt-space-sm">
                <div className="flex items-center justify-between gap-space-sm">
                  <p className="font-mono text-telemetry-md text-on-surface">{label}</p>
                  <Button variant="destructive" onClick={() => deleteRule(rule)}>
                    DELETE
                  </Button>
                </div>
                {rule.message && <p className="font-body-md text-on-surface-variant">{rule.message}</p>}
                <AlertLevelPicker label={`Level for ${label}`} value={rule.level} onChange={(level) => changeLevel(rule, level)} />
              </li>
            );
          })}
        </ul>
      )}
      {adding ? (
        <AlertRuleForm entity={entity} onSubmit={createRule} onCancel={() => setAdding(false)} />
      ) : (
        <Button variant="secondary" className="self-start" onClick={() => setAdding(true)}>
          ADD ALERT
        </Button>
      )}
    </Card>
  );
}
