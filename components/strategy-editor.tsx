"use client";

import { useEffect, useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { applyHandwritten, defaultCondition, newConditionId, parseHandwritten, structuredLabel } from "@/lib/strategies";
import type {
  IndicatorKind,
  MatchMode,
  RelationKind,
  Strategy,
  StrategyCondition,
  StrategySide,
  Timeframe,
} from "@/lib/types";

export function StrategyEditor({
  open,
  strategy,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  strategy: Strategy | null;
  onOpenChange: (open: boolean) => void;
  onSave: (strategy: Strategy) => void;
}) {
  const draft = strategy;
  const [name, setName] = useState(strategy?.name ?? "");
  const [side, setSide] = useState<StrategySide>(strategy?.side ?? "buy");
  const [match, setMatch] = useState<MatchMode>(strategy?.match ?? "all");
  const [conditions, setConditions] = useState<StrategyCondition[]>(
    strategy?.conditions.map((c) => ({ ...c })) ?? [],
  );

  useEffect(() => {
    if (!strategy) return;
    setName(strategy.name);
    setSide(strategy.side);
    setMatch(strategy.match);
    setConditions(strategy.conditions.map((c) => ({ ...c })));
  }, [strategy]);

  if (!draft) return null;

  function updateCondition(id: string, patch: Partial<StrategyCondition>) {
    setConditions((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        if (patch.handwritten !== undefined && Object.keys(patch).length === 1) {
          return parseHandwritten(patch.handwritten, c);
        }
        const next = { ...c, ...patch };
        if (patch.indicator === "ma") next.relation = "cross_above";
        if (patch.indicator === "macd_hist") next.relation = "trough_turn_up";
        if (patch.indicator === "price_pct") next.relation = "pct_band";
        if (!patch.handwritten) next.handwritten = "";
        return applyHandwritten(next);
      }),
    );
  }

  function handleSave() {
    if (!draft) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    if (conditions.length === 0) return;
    onSave({
      id: draft.id,
      name: trimmed,
      enabled: draft.enabled,
      side,
      match,
      conditions: conditions.map((c) => applyHandwritten(c)),
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{draft.id.startsWith("new-") ? "新增策略" : "编辑策略"}</DialogTitle>
          <DialogDescription>
            每条条件都可以手写。槽位会按文字切换：均线、MACD，或收益/损失百分比。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="strategy-name">名称</Label>
            <Input
              id="strategy-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：周线拐头 + 日线金叉"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>方向</Label>
              <Select value={side} onValueChange={(v) => setSide(v as StrategySide)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy">买入</SelectItem>
                  <SelectItem value="sell">卖出</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>匹配</Label>
              <Select value={match} onValueChange={(v) => setMatch(v as MatchMode)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部满足</SelectItem>
                  <SelectItem value="any">任一满足</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label>条件</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setConditions((prev) => [
                  ...prev,
                  defaultCondition({ id: newConditionId() }),
                ])
              }
            >
              <PlusIcon />
              添加条件
            </Button>
          </div>

          <div className="grid gap-3">
            {conditions.map((condition, index) => (
              <ConditionFields
                key={condition.id}
                index={index}
                condition={condition}
                onChange={(patch) => updateCondition(condition.id, patch)}
                onRemove={() =>
                  setConditions((prev) => prev.filter((c) => c.id !== condition.id))
                }
                canRemove={conditions.length > 1}
              />
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || conditions.length === 0}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConditionFields({
  index,
  condition,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  condition: StrategyCondition;
  onChange: (patch: Partial<StrategyCondition>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="grid gap-3 rounded-xl border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">条件 {index + 1}</p>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onRemove}
          disabled={!canRemove}
          aria-label="删除条件"
        >
          <Trash2Icon />
        </Button>
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">手写</Label>
        <Input
          value={condition.handwritten}
          onChange={(e) => onChange({ handwritten: e.target.value })}
          onBlur={(e) => onChange({ handwritten: e.target.value })}
          placeholder="例如：周K MACD柱 近26根最低点后拐头向上"
        />
        <p className="text-xs text-muted-foreground">
          槽位：{structuredLabel(condition)}
        </p>
      </div>
      {condition.indicator === "unparsed" ? (
        <p className="text-sm text-amber-700">
          未识别为可执行规则。可写「周K MACD拐头」「日K MA5上穿MA10」或「收益损失5%卖出」。
        </p>
      ) : (
        <>
      <div className="grid gap-3 sm:grid-cols-3">
        {condition.indicator !== "price_pct" ? (
        <FieldSelect
          label="周期"
          value={condition.timeframe}
          onChange={(v) => onChange({ timeframe: v as Timeframe })}
          options={[
            { value: "daily", label: "日K" },
            { value: "weekly", label: "周K" },
          ]}
        />
        ) : null}
        <FieldSelect
          label="指标"
          value={condition.indicator}
          onChange={(v) => onChange({ indicator: v as IndicatorKind })}
          options={[
            { value: "ma", label: "均线 MA" },
            { value: "macd_hist", label: "MACD 柱" },
            { value: "price_pct", label: "涨跌幅" },
          ]}
        />
        <FieldSelect
          label="关系"
          value={condition.relation}
          onChange={(v) => onChange({ relation: v as RelationKind })}
          options={
            condition.indicator === "ma"
              ? [{ value: "cross_above", label: "上穿" }]
              : condition.indicator === "price_pct"
                ? [
                    { value: "pct_band", label: "收益或损失达到" },
                    { value: "stop_loss", label: "亏损达到" },
                    { value: "take_profit", label: "盈利达到" },
                  ]
                : [
                    { value: "trough_turn_up", label: "最低点后拐头向上" },
                    { value: "near_high", label: "处于高点附近" },
                  ]
          }
        />
      </div>
      {condition.indicator === "ma" ? (
        <div
          className="grid grid-cols-2 gap-3"
          key={`ma-${condition.fastPeriod}-${condition.slowPeriod}`}
        >
          <NumberField
            label="快线周期"
            value={condition.fastPeriod}
            onChange={(fastPeriod) => onChange({ fastPeriod })}
          />
          <NumberField
            label="慢线周期"
            value={condition.slowPeriod}
            onChange={(slowPeriod) => onChange({ slowPeriod })}
          />
        </div>
      ) : condition.indicator === "price_pct" ? (
        <div
          className="grid grid-cols-2 gap-3"
          key={`pct-${condition.relation}-${condition.pctThreshold}`}
        >
          <NumberField
            label="百分比"
            value={condition.pctThreshold}
            onChange={(pctThreshold) => onChange({ pctThreshold })}
          />
        </div>
      ) : (
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          key={`macd-${condition.macdFast}-${condition.macdSlow}-${condition.macdSignal}-${condition.lookback}-${condition.nearHighRatio}-${condition.relation}`}
        >
          <NumberField
            label="快线"
            value={condition.macdFast}
            onChange={(macdFast) => onChange({ macdFast })}
          />
          <NumberField
            label="慢线"
            value={condition.macdSlow}
            onChange={(macdSlow) => onChange({ macdSlow })}
          />
          <NumberField
            label="DEA"
            value={condition.macdSignal}
            onChange={(macdSignal) => onChange({ macdSignal })}
          />
          <NumberField
            label="回看根数"
            value={condition.lookback}
            onChange={(lookback) => onChange({ lookback })}
          />
          {condition.relation === "near_high" ? (
            <NumberField
              label="高点比例"
              value={condition.nearHighRatio}
              step={0.05}
              onChange={(nearHighRatio) => onChange({ nearHighRatio })}
            />
          ) : null}
        </div>
      )}
        </>
      )}
    </div>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select key={value} value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);

  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          if (next.trim() === "" || next === "-" || next.endsWith(".")) return;
          const n = Number(next);
          if (Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => {
          const n = Number(text);
          if (Number.isFinite(n)) {
            onChange(n);
            setText(String(n));
          } else {
            setText(String(value));
          }
        }}
        step={step}
      />
    </div>
  );
}
