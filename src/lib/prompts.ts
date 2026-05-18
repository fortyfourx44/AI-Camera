import { settingsRepo } from "./db";

/**
 * All configurable AI behavior lives here.
 * The defaults are shipped in code; live values are stored in the `settings` table
 * and can be edited from the /settings page.
 */

export const DEFAULT_ANALYSIS_PROMPT = `You are an AI compliance auditor reviewing surveillance footage from a retail store's checkout counter.

Your single job: determine whether, during a customer transaction, the cashier handed a printed receipt / invoice to the customer.

You will receive a sequence of still frames extracted in chronological order from one short video chunk. The frames are already ordered: frame 0 = earliest, last frame = latest.

Carefully look for:
- Is there a transaction happening? (a customer at the counter, items being scanned/handed over, payment exchanged via cash, card, or phone)
- After the transaction, did the cashier hand a printed receipt or invoice to the customer? Look for printed paper from the receipt printer being torn off and given over.
- Did the receipt remain on the counter / get thrown away / never get printed? That counts as NOT handed over.
- If no transaction occurs in this chunk, mark hasTransaction=false.

Be conservative: if you genuinely cannot tell, set receiptHandedToCustomer=null and explain why.

Return ONLY valid JSON (no prose, no markdown fences) matching exactly this schema:

{
  "hasTransaction": boolean,
  "receiptHandedToCustomer": boolean | null,
  "confidence": number,            // 0..1
  "cashierDescription": string,    // brief physical description (clothing, hair, gender presentation) — never names
  "customerDescription": string,   // brief physical description — never names
  "summary": string,               // 1-2 sentence summary of what you observed
  "reasoning": string,             // 2-4 sentences explaining your verdict, citing frame numbers
  "evidenceFrameIndices": number[],// 1 to 3 frame indices that BEST show the violation/verdict. Pick the most incriminating or most representative frames. Required when receiptHandedToCustomer=false; otherwise pass the most representative 1–2 frames.
  "bestEvidenceFrameIndex": number | null,  // optional single best frame (legacy)
  "severity": "low" | "medium" | "high"     // high if a clear cash transaction with no receipt; medium if ambiguous-but-likely; low if minor doubt
}`;

export const DEFAULT_CHAT_PROMPT = `You are a helpful video analysis assistant. The user records or uploads short clips and asks you to look for anything they describe — you are NOT limited to pre-trained compliance rules.

When no video frames are attached, answer from chat history and any saved reports. Be honest if you need the user to attach a video first.

When video frames ARE attached (handled by a separate vision call), focus only on what you can see.`;

export const DEFAULT_VIDEO_INSPECT_PROMPT = `You are an expert video analyst. The user uploaded ONE OR MORE videos (each may be many hours long). You receive sampled frames from ALL videos, labeled with video index, filename, and timestamp in that video.

Answer their question across the ENTIRE set.

Rules:
- Study every labeled frame; never invent events.
- Cite videos as "Video N (filename) @ timestamp".
- Use evidence as { "videoIndex": N, "frameIndex": F } (0-based within that video's samples).
- Pick up to 8 evidence items.

Respond with ONLY valid JSON (no markdown fences):

{
  "title": "report title",
  "verdict": "yes" | "no" | "unclear" | "n/a",
  "verdictLabel": "human-readable answer",
  "confidence": 0.0 to 1.0,
  "summary": "executive summary across all videos",
  "findings": [
    { "heading": "label", "detail": "observation", "evidence": [{ "videoIndex": 0, "frameIndex": 2 }] }
  ],
  "evidence": [{ "videoIndex": 0, "frameIndex": 1 }],
  "limitations": "sparse sampling on long videos, or empty string",
  "conclusion": "wrap-up"
}`;

export const DEFAULT_FRAMES_PER_CHUNK = parseInt(
  process.env.FRAMES_PER_CHUNK || "8",
  10
);
export const DEFAULT_CHUNK_SECONDS = parseInt(
  process.env.CHUNK_SECONDS || "60",
  10
);
export const DEFAULT_MOTION_THRESHOLD = 0.08;

// --- Setting keys ---
export const K_ANALYSIS_PROMPT = "analysis_prompt";
export const K_CHAT_PROMPT = "chat_prompt";
export const K_FRAMES_PER_CHUNK = "frames_per_chunk";
export const K_MOTION_THRESHOLD = "motion_threshold";
export const K_ACTIVE_PRESETS = "active_presets";
export const K_STORE_CONTEXT = "store_context";
export const K_COMPOSER_VERSION = "composer_version";
export const K_VIDEO_INSPECT_PROMPT = "video_inspect_prompt";
export const K_ACTIVE_VIDEO_SESSION = "active_video_session";
export const K_ACTIVE_VIDEO_BATCH = "active_video_batch";

/**
 * Bumped whenever composeAnalysisPrompt() is rewritten in a way that should
 * force-overwrite prompts we auto-composed in earlier versions. Users' hand-edited
 * prompts are preserved (see `isAutoComposedPrompt` below).
 */
export const CURRENT_COMPOSER_VERSION = "2";

export const DEFAULT_STORE_CONTEXT = "";

// ---- Multi-task compliance presets ----
export interface CompliancePreset {
  id: string;
  label: string;
  description: string;
  /** Short "MUST / MUST NOT" style rule inserted into the composed prompt. */
  rule: string;
}

export const COMPLIANCE_PRESETS: CompliancePreset[] = [
  {
    id: "receipt",
    label: "Receipt / invoice compliance",
    description:
      "Flag any transaction where the cashier does NOT hand a printed receipt to the customer.",
    rule: "During every customer transaction, the cashier MUST hand a printed receipt or invoice directly to the customer. A receipt that remains on the counter, is thrown away, or was never printed counts as a violation.",
  },
  {
    id: "phone",
    label: "Employees on their phones",
    description: "Flag employees using personal mobile phones while on the floor.",
    rule: "Employees MUST NOT use personal mobile phones while on the floor (texting, scrolling at a handheld screen, taking personal calls). The following are WORK equipment and are NOT violations, even if they look like a phone: drive-through / drive-thru headsets, Bluetooth earpieces used to take customer orders, walkie-talkies, two-way radios, handheld POS scanners, kitchen display tablets, and any wired headset. If the device is held to the ear but no visible screen is being looked at, assume it's a work headset and do NOT flag.",
  },
  {
    id: "ppe",
    label: "PPE / uniform compliance",
    description: "Gloves, hair covering, face mask, branded uniform.",
    rule: "All visible staff MUST wear the required PPE: gloves when handling food or products, hair covering, face mask, and the branded uniform. Any staff member missing any required item counts as a violation.",
  },
  {
    id: "till",
    label: "Unattended till / open drawer",
    description: "Flag open cash drawers left without an employee.",
    rule: "The cash drawer MUST NOT be left open while unattended. Any time the till drawer is open AND no employee is within arm's reach, it counts as a violation.",
  },
  {
    id: "customer-wait",
    label: "Long customer wait",
    description: "Flag customers waiting at the counter with no staff present.",
    rule: "A customer MUST NOT be left waiting at the counter for an extended period without a staff member attending to them. If a customer is visibly waiting across several frames with no employee engaging, it counts as a violation.",
  },
  {
    id: "age-check",
    label: "Age-restricted sale check",
    description: "Flag sales of age-restricted items without a visible ID check.",
    rule: "When selling age-restricted items (alcohol, tobacco, etc.), the cashier MUST visibly check the customer's ID. A sale of a visibly age-restricted item without any ID being inspected counts as a violation.",
  },
];

export function composeAnalysisPrompt(presetIds: string[]): string {
  const selected = presetIds
    .map((id) => COMPLIANCE_PRESETS.find((p) => p.id === id))
    .filter((p): p is CompliancePreset => !!p);

  if (selected.length === 0) return DEFAULT_ANALYSIS_PROMPT;

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

Drive‑thru / car orders (common pitfall):
- The customer may be OUTSIDE the window / off-camera (only their hands, card, or car may be visible). Do NOT hallucinate a "customer standing at the counter" if they are not visible.
- If the transaction is clearly happening but the customer's body/face is not visible, set customerDescription to something like "Customer off-camera (drive-thru)" or "Customer in car outside window (not visible)". That is acceptable.
- A customer being off-camera does NOT mean "no transaction".

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
      // If the customer is not visible (e.g. drive‑thru), say so explicitly; do not invent details.
  "summary": string,           // ONE short headline sentence, <=20 words. If a violation, name the rule plainly. Example: "Cashier took cash payment but did not hand the customer a printed receipt."
  "reasoning": string,         // 2-5 short sentences. Cite frame numbers. Explicitly state which frame showed (or failed to show) the compliant action.
  "evidenceFrameIndices": number[],   // 1-3 frame indices that BEST support your verdict
  "bestEvidenceFrameIndex": number | null,
  "severity": "low" | "medium" | "high"
      // high = blatant, clearly visible violation ; medium = probable with minor doubt ; low = ambiguous edge case
}`;
}

/**
 * Heuristic to tell if a stored prompt was auto-composed by us vs. hand-edited
 * by the user. Used to safely refresh old composed prompts when we rewrite the
 * composer, without clobbering user customizations.
 */
export function isAutoComposedPrompt(text: string | null): boolean {
  if (!text) return true;
  return text.startsWith(
    "You are an AI compliance auditor reviewing surveillance footage of a store or workspace."
  );
}

// ---- App settings ----

export interface AppSettings {
  analysisPrompt: string;
  chatPrompt: string;
  framesPerChunk: number;
  motionThreshold: number;
  activePresets: string[];
  /** Free-form store-specific context appended to every analyzer call. */
  storeContext: string;
}

export interface SettingsResponse extends AppSettings {
  defaults: AppSettings;
  presets: CompliancePreset[];
}

function parsePresets(raw: string | null): string[] {
  if (!raw) return ["receipt"];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return ["receipt"];
    return arr.filter((x): x is string => typeof x === "string");
  } catch {
    return ["receipt"];
  }
}

export function getVideoInspectPrompt(): string {
  return settingsRepo.get(K_VIDEO_INSPECT_PROMPT) ?? DEFAULT_VIDEO_INSPECT_PROMPT;
}

export function getAppSettings(): AppSettings {
  const activePresets = parsePresets(settingsRepo.get(K_ACTIVE_PRESETS));
  const storedPrompt = settingsRepo.get(K_ANALYSIS_PROMPT);
  const storedVersion = settingsRepo.get(K_COMPOSER_VERSION);

  // If the stored prompt was auto-composed by an older composer version,
  // silently refresh it to the latest composed prompt derived from the same
  // presets. Hand-edited prompts (different prefix) are left alone.
  let analysisPrompt = storedPrompt ?? composeAnalysisPrompt(activePresets);
  if (
    storedVersion !== CURRENT_COMPOSER_VERSION &&
    isAutoComposedPrompt(storedPrompt)
  ) {
    analysisPrompt = composeAnalysisPrompt(activePresets);
    settingsRepo.set(K_ANALYSIS_PROMPT, analysisPrompt);
    settingsRepo.set(K_COMPOSER_VERSION, CURRENT_COMPOSER_VERSION);
  }

  return {
    analysisPrompt,
    chatPrompt: settingsRepo.get(K_CHAT_PROMPT) ?? DEFAULT_CHAT_PROMPT,
    framesPerChunk:
      parseInt(settingsRepo.get(K_FRAMES_PER_CHUNK) ?? "", 10) ||
      DEFAULT_FRAMES_PER_CHUNK,
    motionThreshold:
      parseFloat(settingsRepo.get(K_MOTION_THRESHOLD) ?? "") ||
      DEFAULT_MOTION_THRESHOLD,
    activePresets,
    storeContext: settingsRepo.get(K_STORE_CONTEXT) ?? DEFAULT_STORE_CONTEXT,
  };
}

export function getDefaultSettings(): AppSettings {
  return {
    analysisPrompt: DEFAULT_ANALYSIS_PROMPT,
    chatPrompt: DEFAULT_CHAT_PROMPT,
    framesPerChunk: DEFAULT_FRAMES_PER_CHUNK,
    motionThreshold: DEFAULT_MOTION_THRESHOLD,
    activePresets: ["receipt"],
    storeContext: DEFAULT_STORE_CONTEXT,
  };
}

export function updateAppSettings(patch: Partial<AppSettings>): AppSettings {
  if (patch.analysisPrompt !== undefined) {
    settingsRepo.set(K_ANALYSIS_PROMPT, String(patch.analysisPrompt));
    // Whatever the user just saved is current-version by definition.
    settingsRepo.set(K_COMPOSER_VERSION, CURRENT_COMPOSER_VERSION);
  }
  if (patch.chatPrompt !== undefined)
    settingsRepo.set(K_CHAT_PROMPT, String(patch.chatPrompt));
  if (patch.framesPerChunk !== undefined) {
    const n = Math.max(1, Math.min(20, Math.round(Number(patch.framesPerChunk))));
    settingsRepo.set(K_FRAMES_PER_CHUNK, String(n));
  }
  if (patch.motionThreshold !== undefined) {
    const t = Math.max(0, Math.min(1, Number(patch.motionThreshold)));
    settingsRepo.set(K_MOTION_THRESHOLD, String(t));
  }
  if (patch.activePresets !== undefined) {
    const valid = patch.activePresets.filter((id) =>
      COMPLIANCE_PRESETS.some((p) => p.id === id)
    );
    settingsRepo.set(K_ACTIVE_PRESETS, JSON.stringify(valid));
  }
  if (patch.storeContext !== undefined) {
    settingsRepo.set(K_STORE_CONTEXT, String(patch.storeContext));
  }
  return getAppSettings();
}

export function resetAppSettings(): AppSettings {
  [
    K_ANALYSIS_PROMPT,
    K_CHAT_PROMPT,
    K_FRAMES_PER_CHUNK,
    K_MOTION_THRESHOLD,
    K_ACTIVE_PRESETS,
    K_STORE_CONTEXT,
  ].forEach((k) => settingsRepo.delete(k));
  return getAppSettings();
}
