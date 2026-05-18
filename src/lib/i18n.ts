export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "ai_ip_cam_locale";

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

export function dirFor(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** Keys for every user-visible string in the app. */
export type MessageKey =
  // Layout / meta
  | "app.title"
  | "app.tagline"
  // Header nav
  | "nav.reports"
  | "nav.settings"
  | "nav.dashboard"
  | "nav.allReports"
  // System banner
  | "system.ready"
  | "system.streams"
  | "system.violations"
  | "system.logged"
  | "system.model"
  | "system.claudeMissing"
  | "system.ffmpegMissing"
  | "system.serverlessWarning"
  | "system.databaseError"
  // Cameras panel
  | "cameras.title"
  | "cameras.subtitle"
  | "cameras.add"
  | "cameras.empty"
  | "cameras.loading"
  | "cameras.statusIdle"
  | "cameras.statusRecording"
  | "cameras.statusAnalyzing"
  | "cameras.statusError"
  | "cameras.start"
  | "cameras.stop"
  | "cameras.delete"
  | "cameras.deleteConfirm"
  | "cameras.runDuration"
  | "cameras.runDurationUnlimited"
  | "cameras.runDuration15m"
  | "cameras.runDuration30m"
  | "cameras.runDuration1h"
  | "cameras.runDuration2h"
  | "cameras.runDuration6h"
  // Add camera dialog
  | "addCamera.title"
  | "addCamera.description"
  | "addCamera.tabPreset"
  | "addCamera.tabManual"
  | "addCamera.brand"
  | "addCamera.host"
  | "addCamera.port"
  | "addCamera.username"
  | "addCamera.password"
  | "addCamera.bulk"
  | "addCamera.displayName"
  | "addCamera.channel"
  | "addCamera.prefix"
  | "addCamera.count"
  | "addCamera.useSub"
  | "addCamera.preview"
  | "addCamera.manualName"
  | "addCamera.manualUrl"
  | "addCamera.manualHint"
  | "addCamera.cancel"
  | "addCamera.save"
  | "addCamera.bulkSave"
  | "addCamera.namePlaceholder"
  | "addCamera.tabCloud"
  | "addCamera.cloud.title"
  | "addCamera.cloud.subtitle"
  | "addCamera.cloud.email"
  | "addCamera.cloud.emailPlaceholder"
  | "addCamera.cloud.password"
  | "addCamera.cloud.signIn"
  | "addCamera.cloud.signingIn"
  | "addCamera.cloud.signOut"
  | "addCamera.cloud.signedInAs"
  | "addCamera.cloud.lastLoginAt"
  | "addCamera.cloud.loadDevices"
  | "addCamera.cloud.loadingDevices"
  | "addCamera.cloud.noDevices"
  | "addCamera.cloud.deviceOffline"
  | "addCamera.cloud.cameraOffline"
  | "addCamera.cloud.channel"
  | "addCamera.cloud.alreadyImported"
  | "addCamera.cloud.selectQuality"
  | "addCamera.cloud.qualitySub"
  | "addCamera.cloud.qualityMain"
  | "addCamera.cloud.importSelected"
  | "addCamera.cloud.importingSelected"
  | "addCamera.cloud.nothingSelected"
  | "addCamera.cloud.errBadCreds"
  | "addCamera.cloud.errCaptcha"
  | "addCamera.cloud.errNetwork"
  | "addCamera.cloud.errGeneric"
  | "addCamera.cloud.m1Notice"
  | "addCamera.cloud.pollInterval"
  | "addCamera.cloud.pollIntervalHint"
  | "addCamera.cloud.runDuration"
  | "addCamera.cloud.runDurationHint"
  | "addCamera.cloud.pastFootageNotice"
  | "addCamera.cloud.importSuccess"
  | "cameras.snapshotMode"
  | "cameras.snapshotModeHint"
  | "cameras.snapshotModeUrl"
  // Violations panel
  | "violations.title"
  | "violations.subtitle"
  | "violations.total"
  | "violations.empty"
  | "violations.cashier"
  | "violations.deleteConfirm"
  | "violations.severityHigh"
  | "violations.severityMedium"
  | "violations.severityLow"
  // Chat panel
  | "chat.title"
  | "chat.subtitle"
  | "chat.watching"
  | "chat.noRules"
  | "chat.edit"
  | "chat.placeholder"
  | "chat.you"
  | "chat.claude"
  | "chat.thinking"
  | "chat.analyzing"
  | "chat.clear"
  | "chat.clearConfirm"
  | "chat.welcomeTitle"
  | "chat.welcomeBody"
  | "chat.suggestion1"
  | "chat.suggestion2"
  | "chat.suggestion3"
  | "chat.suggestion4"
  | "chat.needVideo"
  | "chat.sessionReady"
  | "video.title"
  | "video.subtitle"
  | "video.upload"
  | "video.record"
  | "video.stop"
  | "video.clear"
  | "video.emptyPreview"
  | "video.framesReady"
  | "video.cameraDenied"
  | "chat.verdictNoActivity"
  | "chat.verdictCompliant"
  | "chat.verdictViolation"
  | "chat.verdictUncertain"
  | "chat.evidence"
  | "chat.showAll"
  | "chat.showEvidence"
  | "chat.showReasoning"
  | "chat.hideReasoning"
  | "chat.openReport"
  | "chat.noViolationsHint"
  | "chat.uploadAckDone"
  | "chat.uploadAckProcessed"
  | "chat.uploadAckChunks"
  | "chat.uploadAckViolations"
  | "chat.uploadError"
  | "chat.attachVideo"
  | "chat.reportShortcut"
  | "chat.recordedAt"
  | "chat.recordedFromFilename"
  | "chat.recordedFromMtime"
  | "chat.recordedFromUser"
  | "chat.uploadAckRecordedAt"
  // Settings
  | "settings.title"
  | "settings.subtitle"
  | "settings.badgeDirty"
  | "settings.badgeSaved"
  | "settings.savedAt"
  | "settings.resetAll"
  | "settings.save"
  | "settings.resetAllConfirm"
  | "settings.tabAnalyzer"
  | "settings.tabChat"
  | "settings.tabTuning"
  | "settings.tasksTitle"
  | "settings.tasksSubtitle"
  | "settings.tasksSelected"
  | "settings.storeContextTitle"
  | "settings.storeContextSubtitle"
  | "settings.storeContextHint"
  | "settings.storeContextPlaceholder"
  | "settings.analyzerPromptTitle"
  | "settings.analyzerPromptSubtitle"
  | "settings.analyzerPromptFooter"
  | "settings.customEdit"
  | "settings.recompose"
  | "settings.chatPromptTitle"
  | "settings.chatPromptSubtitle"
  | "settings.default"
  | "settings.tuningTitle"
  | "settings.tuningSubtitle"
  | "settings.framesLabel"
  | "settings.framesHint"
  | "settings.motionLabel"
  | "settings.motionHint"
  | "settings.charsCount"
  | "settings.language"
  | "settings.languageHint"
  | "settings.loading"
  // Reports list
  | "reports.title"
  | "reports.subtitle"
  | "reports.empty"
  | "reports.badgeTotal"
  | "reports.deleteConfirm"
  // Report detail
  | "report.severity"
  | "report.confidence"
  | "report.detected"
  | "report.offset"
  | "report.cashierLabel"
  | "report.customerLabel"
  | "report.reasoning"
  | "report.evidenceFrames"
  | "report.allFrames"
  | "report.showAll"
  | "report.showEvidence"
  | "report.evidenceBadge"
  | "report.otherFrames"
  | "report.rawMeta"
  | "report.delete"
  | "report.deleting"
  | "report.deleteConfirm"
  | "report.deleteFailed"
  // Preset labels / descriptions
  | "preset.receipt.label"
  | "preset.receipt.description"
  | "preset.phone.label"
  | "preset.phone.description"
  | "preset.ppe.label"
  | "preset.ppe.description"
  | "preset.till.label"
  | "preset.till.description"
  | "preset.customerWait.label"
  | "preset.customerWait.description"
  | "preset.ageCheck.label"
  | "preset.ageCheck.description";

type Dict = Record<MessageKey, string>;

const en: Dict = {
  "app.title": "AI IP-Cam",
  "app.tagline": "Record a clip, then ask the AI anything you want it to look for",
  "nav.reports": "Reports",
  "nav.settings": "AI Settings",
  "nav.dashboard": "Dashboard",
  "nav.allReports": "All reports",
  "system.ready": "System ready.",
  "system.streams": "streams",
  "system.violations": "violations",
  "system.logged": "logged",
  "system.model": "Model",
  "system.claudeMissing":
    "Anthropic API key missing. Add ANTHROPIC_API_KEY to .env.local and restart the dev server.",
  "system.ffmpegMissing":
    "ffmpeg not found. Install it (brew install ffmpeg on macOS) and restart.",
  "system.serverlessWarning":
    "Running on Vercel serverless: live RTSP/Hik-Connect monitoring needs a VPS with ffmpeg. Data in /tmp resets on cold starts. Add ANTHROPIC_API_KEY in Vercel env vars.",
  "system.databaseError": "Database unavailable on this host.",
  "cameras.title": "Cameras",
  "cameras.subtitle": "RTSP streams currently watched by the AI auditor.",
  "cameras.add": "Add",
  "cameras.empty": "No cameras yet. Add one to start auditing live footage.",
  "cameras.loading": "Loading cameras…",
  "cameras.statusIdle": "Idle",
  "cameras.statusRecording": "Recording",
  "cameras.statusAnalyzing": "Analyzing",
  "cameras.statusError": "Error",
  "cameras.start": "Start",
  "cameras.stop": "Stop",
  "cameras.delete": "Delete",
  "cameras.deleteConfirm": "Delete this camera? Recordings on disk are kept.",
  "cameras.runDuration": "Run duration",
  "cameras.runDurationUnlimited": "Until stopped",
  "cameras.runDuration15m": "15 minutes",
  "cameras.runDuration30m": "30 minutes",
  "cameras.runDuration1h": "1 hour",
  "cameras.runDuration2h": "2 hours",
  "cameras.runDuration6h": "6 hours",
  "addCamera.title": "Add a camera",
  "addCamera.description":
    "Use a brand preset to auto-build the RTSP URL, or paste one manually.",
  "addCamera.tabPreset": "Brand preset",
  "addCamera.tabManual": "Manual RTSP URL",
  "addCamera.brand": "Camera brand",
  "addCamera.host": "NVR / camera IP",
  "addCamera.port": "Port",
  "addCamera.username": "Username",
  "addCamera.password": "Password",
  "addCamera.bulk": "Add multiple cameras at once (great for NVRs)",
  "addCamera.displayName": "Display name",
  "addCamera.channel": "Channel",
  "addCamera.prefix": "Name prefix",
  "addCamera.count": "How many channels?",
  "addCamera.useSub": "Use sub-stream (lower bandwidth, recommended for AI analysis)",
  "addCamera.preview": "URL preview",
  "addCamera.manualName": "Name",
  "addCamera.manualUrl": "RTSP URL",
  "addCamera.manualHint":
    "Tip: test the URL with VLC first (Media → Open Network Stream).",
  "addCamera.cancel": "Cancel",
  "addCamera.save": "Add camera",
  "addCamera.bulkSave": "Add {count} cameras",
  "addCamera.namePlaceholder": "Main checkout",
  "addCamera.tabCloud": "Hik-Connect cloud",
  "addCamera.cloud.title": "Sign in to Hik-Connect",
  "addCamera.cloud.subtitle":
    "Enter the email and password you use in the HiLook / Hik-Connect app. We'll list your cameras so you can pick which ones to analyze.",
  "addCamera.cloud.email": "Username, email, or phone",
  "addCamera.cloud.emailPlaceholder": "your Hik-Connect username",
  "addCamera.cloud.password": "Password",
  "addCamera.cloud.signIn": "Sign in",
  "addCamera.cloud.signingIn": "Signing in…",
  "addCamera.cloud.signOut": "Sign out",
  "addCamera.cloud.signedInAs": "Signed in as",
  "addCamera.cloud.lastLoginAt": "Last login",
  "addCamera.cloud.loadDevices": "Load devices",
  "addCamera.cloud.loadingDevices": "Loading devices…",
  "addCamera.cloud.noDevices": "No devices found on this account.",
  "addCamera.cloud.deviceOffline": "offline",
  "addCamera.cloud.cameraOffline": "no signal",
  "addCamera.cloud.channel": "Ch.",
  "addCamera.cloud.alreadyImported": "already imported",
  "addCamera.cloud.selectQuality": "Quality",
  "addCamera.cloud.qualitySub": "Sub (low bandwidth)",
  "addCamera.cloud.qualityMain": "Main (full HD)",
  "addCamera.cloud.importSelected": "Import {n} selected",
  "addCamera.cloud.importingSelected": "Importing…",
  "addCamera.cloud.nothingSelected": "Pick at least one camera to import.",
  "addCamera.cloud.errBadCreds":
    "Hik-Connect rejected those credentials. Double-check the username and password. If you're sure they're right, open the HiLook app, sign in there to clear any security flag, and try again.",
  "addCamera.cloud.errCaptcha":
    "Hik-Connect is asking for a CAPTCHA. Open the HiLook app, sign in there to clear it, then retry here.",
  "addCamera.cloud.errNetwork":
    "Couldn't reach Hik-Connect. Check your internet connection and try again.",
  "addCamera.cloud.errGeneric": "Couldn't sign in: {msg}",
  "addCamera.cloud.m1Notice":
    "Snapshot mode: cloud cameras are analyzed from periodic JPEGs rather than live video. Each camera polls a fresh picture on your chosen interval below, and chunks of frames are sent to the AI only when something changes.",
  "addCamera.cloud.pollInterval": "Poll interval (seconds per snapshot)",
  "addCamera.cloud.pollIntervalHint":
    "How often to grab a fresh picture from each camera. Lower = finer detection but more cloud calls. 20s is a good starting point; 10s for high-traffic cashiers, 60s for mostly-idle areas.",
  "addCamera.cloud.runDuration": "How long to analyze after import",
  "addCamera.cloud.runDurationHint":
    "Applies to cameras you import in this batch. Choose “Until stopped” to keep polling until you press Stop on each camera.",
  "addCamera.cloud.pastFootageNotice":
    "Recorded footage from yesterday (or any past time) is not available through this cloud link — we only receive fresh snapshots, not NVR playback. To analyze a past clip, export or download it from the HiLook app (or your recorder) and attach the video in the AI Auditor chat.",
  "addCamera.cloud.importSuccess":
    "Imported {n} camera(s). Snapshot analysis has started automatically — watch the Cameras panel for activity.",
  "cameras.snapshotMode": "snapshot",
  "cameras.snapshotModeHint":
    "Cloud camera — analyzed from periodic JPEGs instead of live video.",
  "cameras.snapshotModeUrl": "Hik-Connect cloud snapshot",
  "violations.title": "Violations",
  "violations.subtitle":
    "Transactions where the cashier did not hand a receipt to the customer.",
  "violations.total": "total",
  "violations.empty": "No violations yet. The AI will flag any here in real time.",
  "violations.cashier": "Cashier",
  "violations.deleteConfirm":
    "Delete this violation report? The screenshots will also be removed.",
  "violations.severityHigh": "HIGH",
  "violations.severityMedium": "MEDIUM",
  "violations.severityLow": "LOW",
  "chat.title": "Ask about your video",
  "chat.subtitle":
    "Record or upload a clip on the left, then describe what you want me to look for — anything visible in the footage.",
  "chat.needVideo": "Record or upload a video first (left panel), then ask your question here.",
  "chat.sessionReady": "Clip loaded",
  "chat.watching": "Watching for:",
  "chat.noRules": "no rules active — click to configure",
  "chat.edit": "edit →",
  "chat.placeholder":
    "e.g. Did the cashier hand a receipt? Is anyone wearing a helmet? Count people at the counter…",
  "chat.you": "You",
  "chat.claude": "Claude",
  "chat.thinking": "Claude is thinking…",
  "chat.analyzing":
    "Analyzing video — this may take a few minutes for long footage…",
  "chat.clear": "Clear chat",
  "chat.clearConfirm": "Clear chat history?",
  "chat.welcomeTitle": "What should I look for in your clip?",
  "chat.welcomeBody":
    "I can check for anything you describe — receipts, safety gear, phones, theft, cleanliness, headcount, and more. No fixed rule list required.",
  "chat.suggestion1": "Did the cashier hand a printed receipt to the customer?",
  "chat.suggestion2": "Is anyone using a phone behind the counter?",
  "chat.suggestion3": "Describe what each person is wearing and doing.",
  "chat.suggestion4": "Flag anything that looks unsafe or suspicious.",
  "video.title": "Your clip",
  "video.subtitle": "Record with your camera or upload a file — analysis runs only when you ask in chat.",
  "video.upload": "Upload video",
  "video.record": "Record",
  "video.stop": "Stop",
  "video.clear": "Clear clip",
  "video.emptyPreview": "Record or upload to begin",
  "video.framesReady": "frames ready",
  "video.cameraDenied": "Camera access was denied. Allow camera permission or upload a file instead.",
  "chat.verdictNoActivity": "No activity",
  "chat.verdictCompliant": "Compliant",
  "chat.verdictViolation": "Violation",
  "chat.verdictUncertain": "Uncertain",
  "chat.evidence": "evidence",
  "chat.showAll": "Show all {n} frames",
  "chat.showEvidence": "Show only evidence",
  "chat.showReasoning": "Show AI reasoning",
  "chat.hideReasoning": "Hide AI reasoning",
  "chat.openReport": "Open report →",
  "chat.noViolationsHint":
    "No violations were flagged. If you're sure one happened, try lowering the motion-gate threshold or increasing Frames per chunk in AI Settings, then re-upload.",
  "chat.uploadAckDone": "Done analyzing",
  "chat.uploadAckProcessed": "Processed",
  "chat.uploadAckChunks": "chunks",
  "chat.uploadAckViolations": "Flagged",
  "chat.uploadError": "Couldn't analyze the video",
  "chat.attachVideo": "Attach video",
  "chat.reportShortcut": "Generate a report",
  "chat.recordedAt": "Recorded on:",
  "chat.recordedFromFilename": "from filename",
  "chat.recordedFromMtime": "from file date",
  "chat.recordedFromUser": "manual",
  "chat.uploadAckRecordedAt": "Recorded",
  "settings.title": "AI behavior",
  "settings.subtitle":
    "Edit exactly what the AI is instructed to watch for, how it answers questions in the chat, and how aggressively the pipeline spends tokens. All changes are stored locally in your SQLite database.",
  "settings.badgeDirty": "Unsaved changes",
  "settings.badgeSaved": "All saved",
  "settings.savedAt": "Saved",
  "settings.resetAll": "Reset all",
  "settings.save": "Save changes",
  "settings.resetAllConfirm":
    "Reset every setting to the shipped defaults? This can't be undone.",
  "settings.tabAnalyzer": "Analyzer",
  "settings.tabChat": "Chat",
  "settings.tabTuning": "Tuning",
  "settings.tasksTitle": "Compliance tasks",
  "settings.tasksSubtitle":
    "Pick as many as you want. The analyzer prompt below is automatically composed from the rules you select. A chunk is flagged as a violation if ANY selected rule is broken.",
  "settings.tasksSelected": "selected",
  "settings.storeContextTitle": "Store-specific context",
  "settings.storeContextSubtitle":
    "Free-form notes about YOUR store that the AI should keep in mind. Use this to prevent false positives (e.g. work equipment that looks like something else). Appended to every analysis call.",
  "settings.storeContextHint": "leave empty to skip",
  "settings.storeContextPlaceholder": `Examples:
- Cashiers wear drive-through headsets for taking car orders — these are work equipment, not personal phones.
- We use handheld tablets for inventory; that's not a phone violation either.
- Receipts print from a kitchen printer behind the counter, not the front register.`,
  "settings.analyzerPromptTitle": "Analyzer system prompt",
  "settings.analyzerPromptSubtitle":
    "What Claude is told every time it looks at a chunk of video. Edit freely — but keep the JSON schema intact, otherwise violations won't be detected.",
  "settings.analyzerPromptFooter":
    "Required JSON fields: hasTransaction, receiptHandedToCustomer, confidence, cashierDescription, customerDescription, summary, reasoning, evidenceFrameIndices, severity",
  "settings.customEdit": "Custom edit",
  "settings.recompose": "Recompose",
  "settings.chatPromptTitle": "Chat system prompt",
  "settings.chatPromptSubtitle":
    "Governs the AI assistant in the dashboard chat panel. The list of violation reports is automatically appended to this prompt.",
  "settings.default": "Default",
  "settings.tuningTitle": "Pipeline tuning",
  "settings.tuningSubtitle":
    "Trade-offs between accuracy, speed, and API cost. Changes apply to future chunks processed — in-flight work keeps its current settings.",
  "settings.framesLabel": "Frames per chunk",
  "settings.framesHint":
    "How many still frames are sent to Claude for each ~60s chunk. More frames = higher accuracy, more tokens. 6–10 is the sweet spot.",
  "settings.motionLabel": "Motion-gate threshold",
  "settings.motionHint":
    "Scene-change sensitivity for the cheap first-pass gate. Lower = analyze more chunks with the LLM (more accurate, more cost). Higher = skip more quiet footage.",
  "settings.charsCount": "chars",
  "settings.language": "Language",
  "settings.languageHint":
    "Controls the interface language AND the language the AI uses in summaries, reasoning, and chat replies.",
  "settings.loading": "Loading settings…",
  "reports.title": "Violation reports",
  "reports.subtitle":
    "Every transaction the AI flagged for the compliance rules you've enabled.",
  "reports.empty":
    "No violation reports yet. Add a camera or upload a video on the dashboard.",
  "reports.badgeTotal": "violations",
  "reports.deleteConfirm": "Delete this violation report?",
  "report.severity": "severity",
  "report.confidence": "confidence",
  "report.detected": "Detected",
  "report.offset": "offset",
  "report.cashierLabel": "Cashier",
  "report.customerLabel": "Customer",
  "report.reasoning": "AI reasoning",
  "report.evidenceFrames": "Evidence frames",
  "report.allFrames": "All extracted frames",
  "report.showAll": "Show all {n} frames",
  "report.showEvidence": "Show only evidence",
  "report.evidenceBadge": "evidence",
  "report.otherFrames":
    "{n} other frames extracted but not flagged as evidence by the AI.",
  "report.rawMeta": "Raw metadata",
  "report.delete": "Delete",
  "report.deleting": "Deleting…",
  "report.deleteConfirm":
    "Delete this violation report? The evidence screenshots will also be removed.",
  "report.deleteFailed": "Failed to delete report.",
  "preset.receipt.label": "Receipt / invoice compliance",
  "preset.receipt.description":
    "Flag any transaction where the cashier does NOT hand a printed receipt to the customer.",
  "preset.phone.label": "Employees on their phones",
  "preset.phone.description":
    "Flag employees using personal mobile phones while on the floor.",
  "preset.ppe.label": "PPE / uniform compliance",
  "preset.ppe.description": "Gloves, hair covering, face mask, branded uniform.",
  "preset.till.label": "Unattended till / open drawer",
  "preset.till.description": "Flag open cash drawers left without an employee.",
  "preset.customerWait.label": "Long customer wait",
  "preset.customerWait.description":
    "Flag customers waiting at the counter with no staff present.",
  "preset.ageCheck.label": "Age-restricted sale check",
  "preset.ageCheck.description":
    "Flag sales of age-restricted items without a visible ID check.",
};

const ar: Dict = {
  "app.title": "AI IP-Cam",
  "app.tagline": "سجّل مقطعاً واسأل الذكاء الاصطناعي عما تريد أن يبحث عنه",
  "nav.reports": "التقارير",
  "nav.settings": "إعدادات الذكاء الاصطناعي",
  "nav.dashboard": "لوحة التحكم",
  "nav.allReports": "كل التقارير",
  "system.ready": "النظام جاهز.",
  "system.streams": "كاميرا",
  "system.violations": "مخالفة",
  "system.logged": "مسجلة",
  "system.model": "النموذج",
  "system.claudeMissing":
    "مفتاح Anthropic API غير موجود. أضِف ANTHROPIC_API_KEY إلى الملف .env.local ثم أعد تشغيل الخادم.",
  "system.ffmpegMissing":
    "ffmpeg غير مثبّت. ثبّته (brew install ffmpeg على الماك) ثم أعد التشغيل.",
  "system.serverlessWarning":
    "يعمل على Vercel بدون خادم دائم: المراقبة المباشرة (RTSP/Hik-Connect) تحتاج VPS مع ffmpeg. البيانات في /tmp تُمسح عند إعادة التشغيل. أضِف ANTHROPIC_API_KEY في متغيرات Vercel.",
  "system.databaseError": "قاعدة البيانات غير متاحة على هذا المضيف.",
  "cameras.title": "الكاميرات",
  "cameras.subtitle": "روابط RTSP التي يراقبها المدقّق الذكي حالياً.",
  "cameras.add": "إضافة",
  "cameras.empty": "لا توجد كاميرات بعد. أضف واحدة لبدء التدقيق المباشر.",
  "cameras.loading": "جارٍ تحميل الكاميرات…",
  "cameras.statusIdle": "خامل",
  "cameras.statusRecording": "يسجّل",
  "cameras.statusAnalyzing": "يحلّل",
  "cameras.statusError": "خطأ",
  "cameras.start": "تشغيل",
  "cameras.stop": "إيقاف",
  "cameras.delete": "حذف",
  "cameras.deleteConfirm": "هل تريد حذف هذه الكاميرا؟ التسجيلات المحفوظة ستبقى.",
  "cameras.runDuration": "مدة التشغيل",
  "cameras.runDurationUnlimited": "حتى الإيقاف يدوياً",
  "cameras.runDuration15m": "١٥ دقيقة",
  "cameras.runDuration30m": "٣٠ دقيقة",
  "cameras.runDuration1h": "ساعة",
  "cameras.runDuration2h": "ساعتان",
  "cameras.runDuration6h": "٦ ساعات",
  "addCamera.title": "إضافة كاميرا",
  "addCamera.description":
    "اختر نوع الكاميرا لبناء رابط RTSP تلقائياً، أو ألصق رابطاً يدوياً.",
  "addCamera.tabPreset": "حسب الماركة",
  "addCamera.tabManual": "رابط RTSP يدوي",
  "addCamera.brand": "ماركة الكاميرا",
  "addCamera.host": "عنوان IP الخاص بالمسجّل / الكاميرا",
  "addCamera.port": "المنفذ",
  "addCamera.username": "اسم المستخدم",
  "addCamera.password": "كلمة المرور",
  "addCamera.bulk": "إضافة عدة كاميرات دفعة واحدة (مناسب للمسجّلات)",
  "addCamera.displayName": "الاسم المعروض",
  "addCamera.channel": "القناة",
  "addCamera.prefix": "بادئة الاسم",
  "addCamera.count": "كم قناة؟",
  "addCamera.useSub":
    "استخدم البث الفرعي (جودة أقل، مناسب أكثر لتحليل الذكاء الاصطناعي)",
  "addCamera.preview": "معاينة الرابط",
  "addCamera.manualName": "الاسم",
  "addCamera.manualUrl": "رابط RTSP",
  "addCamera.manualHint":
    "نصيحة: جرّب الرابط في VLC أولاً (ملف → فتح بث شبكي).",
  "addCamera.cancel": "إلغاء",
  "addCamera.save": "إضافة الكاميرا",
  "addCamera.bulkSave": "إضافة {count} كاميرات",
  "addCamera.namePlaceholder": "كاشير رئيسي",
  "addCamera.tabCloud": "Hik-Connect السحابي",
  "addCamera.cloud.title": "تسجيل الدخول إلى Hik-Connect",
  "addCamera.cloud.subtitle":
    "أدخل البريد الإلكتروني وكلمة المرور اللذين تستخدمهما في تطبيق HiLook / Hik-Connect. سنعرض كاميراتك لتختار أيها ترغب في تحليلها.",
  "addCamera.cloud.email": "اسم المستخدم أو البريد أو رقم الجوال",
  "addCamera.cloud.emailPlaceholder": "اسم المستخدم في Hik-Connect",
  "addCamera.cloud.password": "كلمة المرور",
  "addCamera.cloud.signIn": "تسجيل الدخول",
  "addCamera.cloud.signingIn": "جارٍ تسجيل الدخول…",
  "addCamera.cloud.signOut": "تسجيل الخروج",
  "addCamera.cloud.signedInAs": "مسجّل الدخول كـ",
  "addCamera.cloud.lastLoginAt": "آخر تسجيل دخول",
  "addCamera.cloud.loadDevices": "تحميل الأجهزة",
  "addCamera.cloud.loadingDevices": "جارٍ تحميل الأجهزة…",
  "addCamera.cloud.noDevices": "لم يتم العثور على أجهزة في هذا الحساب.",
  "addCamera.cloud.deviceOffline": "غير متصل",
  "addCamera.cloud.cameraOffline": "بدون إشارة",
  "addCamera.cloud.channel": "قناة",
  "addCamera.cloud.alreadyImported": "مستوردة مسبقاً",
  "addCamera.cloud.selectQuality": "الجودة",
  "addCamera.cloud.qualitySub": "الفرعي (جودة منخفضة)",
  "addCamera.cloud.qualityMain": "الرئيسي (جودة عالية)",
  "addCamera.cloud.importSelected": "استيراد {n} محدّدة",
  "addCamera.cloud.importingSelected": "جارٍ الاستيراد…",
  "addCamera.cloud.nothingSelected": "اختر كاميرا واحدة على الأقل للاستيراد.",
  "addCamera.cloud.errBadCreds":
    "رفض Hik-Connect بيانات الدخول. تحقق من اسم المستخدم وكلمة المرور. إن كنت متأكداً من صحتهما، افتح تطبيق HiLook وسجّل الدخول منه لإزالة أي قيد أمني ثم حاول مرة أخرى.",
  "addCamera.cloud.errCaptcha":
    "يطلب Hik-Connect رمز تحقق (كابتشا). افتح تطبيق HiLook وسجّل الدخول منه لإزالة الرمز، ثم أعد المحاولة هنا.",
  "addCamera.cloud.errNetwork":
    "تعذّر الاتصال بـ Hik-Connect. تحقق من الاتصال بالإنترنت وحاول مجدداً.",
  "addCamera.cloud.errGeneric": "تعذّر تسجيل الدخول: {msg}",
  "addCamera.cloud.m1Notice":
    "وضع اللقطات: يتم تحليل الكاميرات السحابية من صور JPEG دورية بدلاً من بث مباشر. تقوم كل كاميرا بالتقاط صورة جديدة حسب الفترة التي تختارها أدناه، ويُرسل دفعة الإطارات إلى الذكاء الاصطناعي فقط عند حدوث تغيّر ملحوظ.",
  "addCamera.cloud.pollInterval": "فاصل الالتقاط (ثواني لكل لقطة)",
  "addCamera.cloud.pollIntervalHint":
    "عدد الثواني بين كل لقطة وأخرى من كل كاميرا. قيمة أقل = اكتشاف أدق ولكن استهلاك أعلى. ٢٠ ثانية بداية جيدة؛ ١٠ للكاشيرات المزدحمة، ٦٠ للمناطق الهادئة.",
  "addCamera.cloud.runDuration": "مدة التحليل بعد الاستيراد",
  "addCamera.cloud.runDurationHint":
    "تنطبق على الكاميرات المستوردة في هذه الدفعة. اختر «حتى الإيقاف يدوياً» للاستمرار حتى تضغط إيقاف لكل كاميرا.",
  "addCamera.cloud.pastFootageNotice":
    "التسجيلات القديمة (مثل أمس أو أي وقت سابق) غير متاحة عبر هذا الربط السحابي — نستقبل لقطات حالية فقط وليس تشغيل أرشيف الـ NVR. لتحليل مقطع قديم، صدّره أو نزّله من تطبيق HiLook (أو المسجّل) ثم أرفق الفيديو في محادثة المدقّق الذكي.",
  "addCamera.cloud.importSuccess":
    "تم استيراد {n} كاميرا. بدأ تحليل اللقطات تلقائياً — راقب لوحة الكاميرات لرؤية النشاط.",
  "cameras.snapshotMode": "لقطات",
  "cameras.snapshotModeHint":
    "كاميرا سحابية — يتم تحليلها من لقطات JPEG دورية بدل البث المباشر.",
  "cameras.snapshotModeUrl": "لقطات سحابية من Hik-Connect",
  "violations.title": "المخالفات",
  "violations.subtitle":
    "المعاملات التي لم يسلّم فيها الكاشير الفاتورة للعميل (أو مخالفات أخرى حسب القواعد المفعّلة).",
  "violations.total": "إجمالي",
  "violations.empty":
    "لا توجد مخالفات بعد. سيتم عرض أي مخالفة هنا لحظة اكتشافها.",
  "violations.cashier": "الكاشير",
  "violations.deleteConfirm": "حذف هذا التقرير؟ سيتم حذف الصور المرفقة أيضاً.",
  "violations.severityHigh": "مرتفعة",
  "violations.severityMedium": "متوسطة",
  "violations.severityLow": "منخفضة",
  "chat.title": "اسأل عن مقطعك",
  "chat.subtitle":
    "سجّل أو ارفع مقطعاً من اليسار، ثم صف ما تريد أن أبحث عنه — أي شيء يظهر في اللقطات.",
  "chat.needVideo": "سجّل أو ارفع فيديو أولاً (اللوحة اليسرى)، ثم اكتب سؤالك هنا.",
  "chat.sessionReady": "المقطع جاهز",
  "chat.watching": "نراقب:",
  "chat.noRules": "لا توجد قواعد مفعّلة — اضغط للإعداد",
  "chat.edit": "تعديل ←",
  "chat.placeholder":
    "مثال: هل سلّم الكاشير فاتورة؟ هل يرتدي أحد خوذة؟ عد الأشخاص عند الكاونتر…",
  "chat.you": "أنت",
  "chat.claude": "كلود",
  "chat.thinking": "كلود يفكّر…",
  "chat.analyzing":
    "جارٍ تحليل الفيديو — قد يستغرق الأمر بضع دقائق للفيديوهات الطويلة…",
  "chat.clear": "مسح المحادثة",
  "chat.clearConfirm": "هل تريد مسح المحادثة؟",
  "chat.welcomeTitle": "ماذا تريد أن أبحث عنه في مقطعك؟",
  "chat.welcomeBody":
    "يمكنني فحص أي شيء تصفه — فواتير، معدات سلامة، هواتف، سرقة، نظافة، عدّ الأشخاص، وغير ذلك. لا حاجة لقائمة قواعد جاهزة.",
  "chat.suggestion1": "هل سلّم الكاشير فاتورة مطبوعة للعميل؟",
  "chat.suggestion2": "هل يستخدم أحد هاتفاً خلف الكاونتر؟",
  "chat.suggestion3": "صف ملابس وحركة كل شخص في المشهد.",
  "chat.suggestion4": "أشر إلى أي شيء يبدو غير آمن أو مريباً.",
  "video.title": "مقطعك",
  "video.subtitle": "سجّل بالكاميرا أو ارفع ملفاً — التحليل يعمل فقط عندما تسأل في المحادثة.",
  "video.upload": "رفع فيديو",
  "video.record": "تسجيل",
  "video.stop": "إيقاف",
  "video.clear": "مسح المقطع",
  "video.emptyPreview": "سجّل أو ارفع للبدء",
  "video.framesReady": "إطار جاهز",
  "video.cameraDenied": "تم رفض الوصول للكاميرا. اسمح بالإذن أو ارفع ملفاً.",
  "chat.verdictNoActivity": "لا نشاط",
  "chat.verdictCompliant": "مطابق",
  "chat.verdictViolation": "مخالفة",
  "chat.verdictUncertain": "غير واضح",
  "chat.evidence": "دليل",
  "chat.showAll": "عرض كل {n} إطار",
  "chat.showEvidence": "عرض الإطارات الدليلية فقط",
  "chat.showReasoning": "إظهار تحليل الذكاء الاصطناعي",
  "chat.hideReasoning": "إخفاء تحليل الذكاء الاصطناعي",
  "chat.openReport": "فتح التقرير ←",
  "chat.noViolationsHint":
    "لم تُرصَد أي مخالفة. إن كنت متأكداً من وجود واحدة، جرّب تقليل حساسية بوابة الحركة أو زيادة عدد الإطارات لكل جزء في إعدادات الذكاء الاصطناعي ثم أعد الرفع.",
  "chat.uploadAckDone": "انتهى التحليل لـ",
  "chat.uploadAckProcessed": "تمت معالجة",
  "chat.uploadAckChunks": "جزء",
  "chat.uploadAckViolations": "تم رصد",
  "chat.uploadError": "تعذّر تحليل الفيديو",
  "chat.attachVideo": "إرفاق فيديو",
  "chat.reportShortcut": "إنشاء تقرير",
  "chat.recordedAt": "تاريخ التسجيل:",
  "chat.recordedFromFilename": "من اسم الملف",
  "chat.recordedFromMtime": "من تاريخ الملف",
  "chat.recordedFromUser": "يدوي",
  "chat.uploadAckRecordedAt": "تاريخ التسجيل",
  "settings.title": "سلوك الذكاء الاصطناعي",
  "settings.subtitle":
    "تحكّم بدقّة بما يراقبه الذكاء الاصطناعي، وكيف يجيب في المحادثة، ومدى تكلفة التحليل. كل التغييرات تُحفظ محلياً في قاعدة SQLite.",
  "settings.badgeDirty": "تغييرات غير محفوظة",
  "settings.badgeSaved": "تم الحفظ",
  "settings.savedAt": "حُفظ",
  "settings.resetAll": "إعادة تعيين الكل",
  "settings.save": "حفظ التغييرات",
  "settings.resetAllConfirm":
    "إعادة جميع الإعدادات إلى القيم الافتراضية؟ لا يمكن التراجع.",
  "settings.tabAnalyzer": "المحلّل",
  "settings.tabChat": "المحادثة",
  "settings.tabTuning": "الضبط",
  "settings.tasksTitle": "مهام الامتثال",
  "settings.tasksSubtitle":
    "اختر ما تشاء. سيتم تركيب توجيهات المحلّل تلقائياً من القواعد المختارة. يُعدّ الجزء مخالفاً إذا خالف أي قاعدة مختارة.",
  "settings.tasksSelected": "مُختار",
  "settings.storeContextTitle": "سياق خاص بالمتجر",
  "settings.storeContextSubtitle":
    "ملاحظات مخصّصة عن متجرك ليأخذها الذكاء الاصطناعي في الحسبان. مفيدة لتجنّب الإنذارات الخاطئة (مثل معدّات عمل تشبه شيئاً آخر). تُلحَق بكل عملية تحليل.",
  "settings.storeContextHint": "اتركه فارغاً للتخطي",
  "settings.storeContextPlaceholder": `أمثلة:
- الكاشير يرتدي سمّاعة drive-thru لاستقبال طلبات السيارات — هذه معدّات عمل وليست هاتفاً شخصياً.
- نستخدم أجهزة لوحية للجرد، ليست هواتف شخصية.
- طابعة الفواتير خلف الكاونتر وليست عند الصندوق الأمامي.`,
  "settings.analyzerPromptTitle": "نص توجيهات المحلّل",
  "settings.analyzerPromptSubtitle":
    "ما يُقال لكلود في كل مرّة ينظر فيها إلى جزء من الفيديو. عدّل بحرية — لكن حافظ على بنية JSON وإلا لن تُكتشف المخالفات.",
  "settings.analyzerPromptFooter":
    "الحقول المطلوبة في JSON: hasTransaction, receiptHandedToCustomer, confidence, cashierDescription, customerDescription, summary, reasoning, evidenceFrameIndices, severity",
  "settings.customEdit": "تعديل مخصّص",
  "settings.recompose": "إعادة التركيب",
  "settings.chatPromptTitle": "نص توجيهات المحادثة",
  "settings.chatPromptSubtitle":
    "يتحكّم بمساعد الذكاء الاصطناعي في لوحة المحادثة. قائمة المخالفات تُلحَق تلقائياً بهذا النص.",
  "settings.default": "الافتراضي",
  "settings.tuningTitle": "ضبط المعالجة",
  "settings.tuningSubtitle":
    "توازن بين الدقّة والسرعة والتكلفة. التغييرات تنطبق على الأجزاء الجديدة.",
  "settings.framesLabel": "عدد الإطارات لكل جزء",
  "settings.framesHint":
    "كم إطاراً يُرسَل إلى كلود لكل جزء (~60 ثانية). إطارات أكثر = دقّة أعلى وتكلفة أعلى. 6–10 هو المناسب عادةً.",
  "settings.motionLabel": "حساسية بوابة الحركة",
  "settings.motionHint":
    "حساسية اكتشاف تغيّر المشهد في المرحلة المجّانية الأولى. أقل = تحليل أجزاء أكثر بواسطة الذكاء الاصطناعي (أدق وأغلى). أعلى = تخطي أجزاء أكثر هدوءاً.",
  "settings.charsCount": "حرف",
  "settings.language": "اللغة",
  "settings.languageHint":
    "تتحكّم بلغة الواجهة، وكذلك اللغة التي يستخدمها الذكاء الاصطناعي في الملخّصات والتعليل وردود المحادثة.",
  "settings.loading": "جارٍ تحميل الإعدادات…",
  "reports.title": "تقارير المخالفات",
  "reports.subtitle":
    "جميع المعاملات التي رصدها الذكاء الاصطناعي بحسب القواعد التي فعّلتها.",
  "reports.empty":
    "لا توجد تقارير مخالفات بعد. أضف كاميرا أو ارفع فيديو من لوحة التحكم.",
  "reports.badgeTotal": "مخالفة",
  "reports.deleteConfirm": "حذف هذا التقرير؟",
  "report.severity": "الخطورة",
  "report.confidence": "نسبة الثقة",
  "report.detected": "وقت الرصد",
  "report.offset": "موقع في الفيديو",
  "report.cashierLabel": "الكاشير",
  "report.customerLabel": "العميل",
  "report.reasoning": "تحليل الذكاء الاصطناعي",
  "report.evidenceFrames": "الإطارات الدليلية",
  "report.allFrames": "جميع الإطارات المستخرجة",
  "report.showAll": "عرض كل {n} إطار",
  "report.showEvidence": "عرض الإطارات الدليلية فقط",
  "report.evidenceBadge": "دليل",
  "report.otherFrames": "{n} إطاراً إضافياً مُستخرج لم يُعتبر دليلاً.",
  "report.rawMeta": "بيانات تقنية",
  "report.delete": "حذف",
  "report.deleting": "جارٍ الحذف…",
  "report.deleteConfirm": "حذف هذا التقرير؟ سيتم حذف الصور أيضاً.",
  "report.deleteFailed": "فشل حذف التقرير.",
  "preset.receipt.label": "إعطاء الفاتورة للعميل",
  "preset.receipt.description":
    "ترصد أي معاملة لم يُسلِّم فيها الكاشير فاتورة مطبوعة للعميل.",
  "preset.phone.label": "استخدام الموظفين لهواتفهم",
  "preset.phone.description":
    "ترصد استخدام الموظفين لهواتفهم الشخصية أثناء العمل.",
  "preset.ppe.label": "الالتزام بالزي ومعدّات الوقاية",
  "preset.ppe.description":
    "القفازات، غطاء الشعر، الكمامة، الزي المعتمد.",
  "preset.till.label": "ترك درج النقود مفتوحاً",
  "preset.till.description":
    "ترصد درج النقود المفتوح الذي تُرك دون موظف.",
  "preset.customerWait.label": "انتظار طويل للعميل",
  "preset.customerWait.description":
    "ترصد عميلاً ينتظر عند الكاونتر دون اهتمام من أي موظف.",
  "preset.ageCheck.label": "التحقق من السن",
  "preset.ageCheck.description":
    "ترصد بيع منتجات ذات عمر محدّد دون التحقق من هوية العميل.",
};

const DICTIONARIES: Record<Locale, Dict> = { en, ar };

/** Get the dictionary for a locale. */
export function dict(locale: Locale): Dict {
  return DICTIONARIES[locale] ?? en;
}

/** Interpolate placeholders like {name} in a template. */
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    vars[k] !== undefined ? String(vars[k]) : `{${k}}`
  );
}
