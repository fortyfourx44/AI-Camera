"use client";

import * as React from "react";
import {
  Check,
  Loader2,
  MessageSquare,
  Pencil,
  RotateCcw,
  Save,
  Sliders,
  Sparkles,
  Video,
  Wand2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

interface Preset {
  id: string;
  label: string;
  description: string;
  rule: string;
}

interface Settings {
  analysisPrompt: string;
  chatPrompt: string;
  framesPerChunk: number;
  motionThreshold: number;
  activePresets: string[];
  storeContext: string;
  defaults: {
    analysisPrompt: string;
    chatPrompt: string;
    framesPerChunk: number;
    motionThreshold: number;
    activePresets: string[];
    storeContext: string;
  };
  presets: Preset[];
}

/**
 * Mirror of composeAnalysisPrompt() in lib/prompts.ts — kept here so we can
 * re-compose live in the browser as the user toggles presets.
 */
function composePrompt(selected: Preset[], fallback: string): string {
  if (selected.length === 0) return fallback;
  const rules = selected
    .map((p, i) => `${i + 1}. [${p.id}] ${p.label}\n   ${p.rule}`)
    .join("\n");
  const ruleIds = selected.map((p) => `"${p.id}"`).join(", ");
  return `You are an AI compliance auditor reviewing surveillance footage of a store or workspace.

You will receive a sequence of still frames in chronological order from one short video chunk. Frame 0 is the earliest, the last frame is the latest. These are samples — the actual video is continuous, so reason from the totality of what the frames show (and what they conspicuously fail to show).

=== Active compliance rules ===
${rules}

=== How to decide (read carefully) ===

Surveillance footage is reviewed SPECIFICALLY because the owner suspects something is off. Be decisive. Do not default to "compliant" just because you did not personally witness the violation in one of the sampled frames.

For every rule above, ask: "Across these frames, is there positive visual proof that the required/compliant action happened?"
- If YES → that rule is followed.
- If the activity clearly occurred AND finished (customer has left, paid and walked away, next customer starting, cashier moved on) AND no frame shows the compliant action → the rule is VIOLATED. Absence of the required action in a completed transaction IS the violation.
- Only use null ("cannot tell") when the transaction/activity is still mid-way in the last frame, or the camera angle genuinely hides the moment in question.

Receipt rule specifics (if "receipt" is active):
- The violation is: transaction completed, no printed receipt was handed directly to the customer.
- A receipt left sitting on the counter, stuck in the printer, torn and dropped, or never printed at all = VIOLATION.
- You do NOT need to see the exact "non-handover" moment. If the customer leaves AND no frame shows paper being handed across, that is enough to flag.

Phone rule specifics (if "phone" is active): handheld personal-phone use (screen visible, scrolling, texting) → violation. Drive-thru / Bluetooth / radio / POS scanner / wired headsets are NOT violations even if held near the face.

=== Output schema ===

Return ONLY valid JSON (no prose, no markdown fences). The field names below are historical — use the MEANING described, not the literal English of the name:

{
  "hasTransaction": boolean,
      // TRUE if any rule-relevant activity is visible (customer at counter, staff on floor, till activity, employees visible). FALSE only if frames show an empty scene with nothing to audit.
  "receiptHandedToCustomer": boolean | null,
      // Overall compliance verdict across ALL active rules.
      //   true  = every active rule was followed (fully compliant)
      //   false = at least one active rule was violated
      //   null  = you genuinely cannot tell from these frames (activity still ongoing, occluded angle)
  "violatedRules": string[],
      // When the verdict is false, list the rule ids that were violated. Use ids from this set: [${ruleIds}]. Empty array when compliant or uncertain.
  "confidence": number,        // 0..1
  "cashierDescription": string,// brief physical description (clothing, hair, gender presentation) — never names
  "customerDescription": string,
  "summary": string,           // ONE short headline sentence, <=20 words. If a violation, name the rule plainly. Example: "Cashier took cash payment but did not hand the customer a printed receipt."
  "reasoning": string,         // 2-5 short sentences. Cite frame numbers. Explicitly state which frame showed (or failed to show) the compliant action.
  "evidenceFrameIndices": number[],   // 1-3 frame indices that BEST support your verdict
  "bestEvidenceFrameIndex": number | null,
  "severity": "low" | "medium" | "high"
      // high = blatant, clearly visible violation ; medium = probable with minor doubt ; low = ambiguous edge case
}`;
}

export function SettingsEditor() {
  const t = useT();
  const [initial, setInitial] = React.useState<Settings | null>(null);
  const [analysisPrompt, setAnalysisPrompt] = React.useState("");
  const [chatPrompt, setChatPrompt] = React.useState("");
  const [framesPerChunk, setFramesPerChunk] = React.useState(8);
  const [motionThreshold, setMotionThreshold] = React.useState(0.08);
  const [activePresets, setActivePresets] = React.useState<string[]>([]);
  const [storeContext, setStoreContext] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: Settings) => {
        setInitial(s);
        setAnalysisPrompt(s.analysisPrompt);
        setChatPrompt(s.chatPrompt);
        setFramesPerChunk(s.framesPerChunk);
        setMotionThreshold(s.motionThreshold);
        setActivePresets(s.activePresets || []);
        setStoreContext(s.storeContext || "");
      });
  }, []);

  const isDirty =
    !!initial &&
    (analysisPrompt !== initial.analysisPrompt ||
      chatPrompt !== initial.chatPrompt ||
      framesPerChunk !== initial.framesPerChunk ||
      motionThreshold !== initial.motionThreshold ||
      activePresets.join(",") !== initial.activePresets.join(",") ||
      storeContext !== initial.storeContext);

  /** Is the current analysisPrompt the one auto-composed from the selected presets? */
  const composedFromSelection = React.useMemo(() => {
    if (!initial) return true;
    const selected = activePresets
      .map((id) => initial.presets.find((p) => p.id === id))
      .filter((p): p is Preset => !!p);
    return composePrompt(selected, initial.defaults.analysisPrompt) === analysisPrompt;
  }, [activePresets, analysisPrompt, initial]);

  function togglePreset(id: string) {
    if (!initial) return;
    const exists = activePresets.includes(id);
    const next = exists
      ? activePresets.filter((x) => x !== id)
      : [...activePresets, id];
    setActivePresets(next);
    // Recompose prompt to reflect the new selection.
    const selected = next
      .map((pid) => initial.presets.find((p) => p.id === pid))
      .filter((p): p is Preset => !!p);
    setAnalysisPrompt(composePrompt(selected, initial.defaults.analysisPrompt));
  }

  function recomposeFromSelection() {
    if (!initial) return;
    const selected = activePresets
      .map((id) => initial.presets.find((p) => p.id === id))
      .filter((p): p is Preset => !!p);
    setAnalysisPrompt(composePrompt(selected, initial.defaults.analysisPrompt));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisPrompt,
          chatPrompt,
          framesPerChunk,
          motionThreshold,
          activePresets,
          storeContext,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setInitial(data);
      setAnalysisPrompt(data.analysisPrompt);
      setChatPrompt(data.chatPrompt);
      setFramesPerChunk(data.framesPerChunk);
      setMotionThreshold(data.motionThreshold);
      setActivePresets(data.activePresets || []);
      setStoreContext(data.storeContext || "");
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function resetAll() {
    if (!confirm(t("settings.resetAllConfirm"))) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", { method: "DELETE" });
      const data: Settings = await res.json();
      setInitial(data);
      setAnalysisPrompt(data.analysisPrompt);
      setChatPrompt(data.chatPrompt);
      setFramesPerChunk(data.framesPerChunk);
      setMotionThreshold(data.motionThreshold);
      setActivePresets(data.activePresets || []);
      setStoreContext(data.storeContext || "");
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  function resetChatPrompt() {
    if (!initial) return;
    setChatPrompt(initial.defaults.chatPrompt);
  }

  if (!initial) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("settings.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="sticky top-0 z-10 -mx-6 flex items-center justify-between border-b bg-background/80 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Badge
            variant={isDirty ? "warning" : "outline"}
            className="text-[10px] uppercase tracking-wide"
          >
            {isDirty ? t("settings.badgeDirty") : t("settings.badgeSaved")}
          </Badge>
          {savedAt && !isDirty && (
            <span className="text-xs text-muted-foreground">
              {t("settings.savedAt")} {new Date(savedAt).toLocaleTimeString()}
            </span>
          )}
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={resetAll} disabled={saving}>
            <RotateCcw className="me-1 h-4 w-4" /> {t("settings.resetAll")}
          </Button>
          <Button size="sm" onClick={save} disabled={saving || !isDirty}>
            {saving ? (
              <Loader2 className="me-1 h-4 w-4 animate-spin" />
            ) : (
              <Save className="me-1 h-4 w-4" />
            )}
            {t("settings.save")}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="analysis" className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="analysis">
            <Video className="me-1 h-4 w-4" /> {t("settings.tabAnalyzer")}
          </TabsTrigger>
          <TabsTrigger value="chat">
            <MessageSquare className="me-1 h-4 w-4" /> {t("settings.tabChat")}
          </TabsTrigger>
          <TabsTrigger value="tuning">
            <Sliders className="me-1 h-4 w-4" /> {t("settings.tabTuning")}
          </TabsTrigger>
        </TabsList>

        {/* Analyzer tab */}
        <TabsContent value="analysis" className="space-y-4">
          <section className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Wand2 className="h-4 w-4 text-primary" /> {t("settings.tasksTitle")}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t("settings.tasksSubtitle")}
                </p>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {activePresets.length} {t("settings.tasksSelected")}
              </Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {initial.presets.map((p) => {
                const selected = activePresets.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePreset(p.id)}
                    className={cn(
                      "flex items-start gap-3 rounded-md border p-3 text-start transition-colors hover:bg-accent/40",
                      selected && "border-primary/50 bg-primary/5"
                    )}
                  >
                    <div
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background"
                      )}
                    >
                      {selected && <Check className="h-3 w-3" />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{p.label}</div>
                      <div className="text-xs text-muted-foreground">{p.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border bg-card p-4">
            <div className="mb-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Pencil className="h-4 w-4 text-primary" />{" "}
                {t("settings.storeContextTitle")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t("settings.storeContextSubtitle")}
              </p>
            </div>
            <Textarea
              value={storeContext}
              onChange={(e) => setStoreContext(e.target.value)}
              placeholder={t("settings.storeContextPlaceholder")}
              className="min-h-[140px] text-xs"
            />
            <div className="mt-1 text-xs text-muted-foreground">
              {storeContext.length.toLocaleString()} {t("settings.charsCount")} ·{" "}
              {t("settings.storeContextHint")}
            </div>
          </section>

          <section className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" />{" "}
                  {t("settings.analyzerPromptTitle")}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t("settings.analyzerPromptSubtitle")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!composedFromSelection && (
                  <Badge
                    variant="warning"
                    className="text-[10px] uppercase tracking-wide"
                  >
                    <Pencil className="me-1 h-3 w-3" /> {t("settings.customEdit")}
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={recomposeFromSelection}
                >
                  <RotateCcw className="me-1 h-4 w-4" /> {t("settings.recompose")}
                </Button>
              </div>
            </div>
            <Textarea
              value={analysisPrompt}
              onChange={(e) => setAnalysisPrompt(e.target.value)}
              className="min-h-[360px] font-mono text-xs"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {analysisPrompt.length.toLocaleString()} {t("settings.charsCount")}
              </span>
              <span>{t("settings.analyzerPromptFooter")}</span>
            </div>
          </section>
        </TabsContent>

        {/* Chat tab */}
        <TabsContent value="chat" className="space-y-4">
          <section className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <MessageSquare className="h-4 w-4 text-primary" />{" "}
                  {t("settings.chatPromptTitle")}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t("settings.chatPromptSubtitle")}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={resetChatPrompt}>
                <RotateCcw className="me-1 h-4 w-4" /> {t("settings.default")}
              </Button>
            </div>
            <Textarea
              value={chatPrompt}
              onChange={(e) => setChatPrompt(e.target.value)}
              className="min-h-[280px] font-mono text-xs"
            />
            <div className="mt-2 text-xs text-muted-foreground">
              {chatPrompt.length.toLocaleString()} {t("settings.charsCount")}
            </div>
          </section>
        </TabsContent>

        {/* Tuning tab */}
        <TabsContent value="tuning" className="space-y-4">
          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Sliders className="h-4 w-4 text-primary" /> {t("settings.tuningTitle")}
            </h2>
            <p className="mb-4 text-xs text-muted-foreground">
              {t("settings.tuningSubtitle")}
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fpc" className="flex items-center justify-between">
                  <span>{t("settings.framesLabel")}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("settings.default")}: {initial.defaults.framesPerChunk}
                  </span>
                </Label>
                <Input
                  id="fpc"
                  type="number"
                  min={1}
                  max={20}
                  value={framesPerChunk}
                  onChange={(e) =>
                    setFramesPerChunk(
                      Math.max(1, Math.min(20, Number(e.target.value) || 1))
                    )
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {t("settings.framesHint")}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mt" className="flex items-center justify-between">
                  <span>{t("settings.motionLabel")}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("settings.default")}: {initial.defaults.motionThreshold}
                  </span>
                </Label>
                <Input
                  id="mt"
                  type="number"
                  step={0.01}
                  min={0}
                  max={1}
                  value={motionThreshold}
                  onChange={(e) =>
                    setMotionThreshold(
                      Math.max(0, Math.min(1, Number(e.target.value) || 0))
                    )
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {t("settings.motionHint")}
                </p>
              </div>
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
