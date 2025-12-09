export interface ModerationLayerDetails {
    title: string;
    shortName: string;
    description: string;
    bullets: string[];
    actions: string[];
}

export type ModerationLayerKey =
    | "SECURITY LAYER 1: PROMPT FILTERING"
    | "SECURITY LAYER 2: MODEL-LEVEL ALIGNMENT"
    | "SECURITY LAYER 3: POST-GENERATION VALIDATION";

export const MODERATION_LAYER_KEYS: ModerationLayerKey[] = [
    "SECURITY LAYER 1: PROMPT FILTERING",
    "SECURITY LAYER 2: MODEL-LEVEL ALIGNMENT",
    "SECURITY LAYER 3: POST-GENERATION VALIDATION",
];

export const MODERATION_LAYER_DETAILS: Record<ModerationLayerKey, ModerationLayerDetails> = {
    "SECURITY LAYER 1: PROMPT FILTERING": {
        title: "Security Layer 1: Prompt Filtering",
        shortName: "Prompt Filtering",
        description:
            "Semantic intent checks and normalization trip these failures before the model starts generating anything.",
        bullets: [
            "Semantic intent detection (not keyword-only)",
            "Unicode normalization catches character smuggling (Test 52)",
            "Adaptive moderation rules evolve continuously",
            "Grok 3 reasoning assist backs the filter",
            "No credit charged for blocked attempts",
            "Keyword failures will fail fast",
        ],
        actions: [
            "Remove disallowed themes or graphic requests from the prompt",
            "Avoid obfuscated characters or mixed unicode styles",
            "Rephrase goals in neutral, policy-compliant language",
        ],
    },
    "SECURITY LAYER 2: MODEL-LEVEL ALIGNMENT": {
        title: "Security Layer 2: Model-Level Alignment",
        shortName: "Model-Level Alignment",
        description:
            "The Aurora base model, tuned with RLHF, halts unsafe generations mid-stream when it detects a policy conflict.",
        bullets: [
            "Failures do not result in spent credits",
            "Aurora model reinforced via RLHF",
            "Bias against producing overly explicit or harmful output",
            "Can't be bypassed via prompt engineering tricks",
            "Result is temporarily cached for subsequent retries",
        ],
        actions: [
            "Reduce the prompt to a safe core idea to produce a successful pass. Avoid explicit or suggestive content in clothing, poses, or scenarios.",
            "Follow a successful pass with incremental additions to the prompt to reach the desired result before the cache expires.",
        ],
    },
    "SECURITY LAYER 3: POST-GENERATION VALIDATION": {
        title: "Security Layer 3: Post-Generation Validation",
        shortName: "Post-Generation Validation",
        description:
            "Completed videos are scanned after render; credits are consumed even if moderation rolls the result back.",
        bullets: [
            "Validation runs after a full render finishes",
            "Several frames are collected at various timestamps for analysis",
            "Vision model checks clothing changes and explicit visuals",
            "Anime style content is less restricted but still monitored",
            "Credits are spent despite the block",
        ],
        actions: [
            "Introduce actions or scenarios that would hide explicit content at key frames (e.g., 'flashing light', 'camera pans away', 'body obscurement').",
            "Use anime elements in the submitted image to reduce strictness of the vision model checks (e.g., 'anime-style border or stickers' around the subject).",
        ],
    },
};

export const isModerationLayerKey = (value: string): value is ModerationLayerKey =>
    (MODERATION_LAYER_KEYS as ReadonlyArray<string>).includes(value);
