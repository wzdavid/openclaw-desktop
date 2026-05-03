export type GeneratedMediaCatalogModel = {
  id: string;
  provider: string;
};

export const GENERATED_IMAGE_GENERATION_MODELS: GeneratedMediaCatalogModel[] = [
  {
    "id": "comfy/workflow",
    "provider": "comfy"
  },
  {
    "id": "fal-ai/flux/dev",
    "provider": "fal"
  },
  {
    "id": "fal-ai/flux/dev/image-to-image",
    "provider": "fal"
  },
  {
    "id": "google/gemini-3-pro-image-preview",
    "provider": "google"
  },
  {
    "id": "google/gemini-3.1-flash-image-preview",
    "provider": "google"
  },
  {
    "id": "minimax-portal/image-01",
    "provider": "minimax-portal"
  },
  {
    "id": "minimax/image-01",
    "provider": "minimax"
  },
  {
    "id": "openai/gpt-image-2",
    "provider": "openai"
  },
  {
    "id": "vydra/grok-imagine",
    "provider": "vydra"
  }
] as const;

export const GENERATED_VIDEO_GENERATION_MODELS: GeneratedMediaCatalogModel[] = [
  {
    "id": "alibaba/wan2.6-i2v",
    "provider": "alibaba"
  },
  {
    "id": "alibaba/wan2.6-r2v",
    "provider": "alibaba"
  },
  {
    "id": "alibaba/wan2.6-r2v-flash",
    "provider": "alibaba"
  },
  {
    "id": "alibaba/wan2.6-t2v",
    "provider": "alibaba"
  },
  {
    "id": "alibaba/wan2.7-r2v",
    "provider": "alibaba"
  },
  {
    "id": "bytedance/seedance-2.0/fast/image-to-video",
    "provider": "fal"
  },
  {
    "id": "bytedance/seedance-2.0/fast/text-to-video",
    "provider": "fal"
  },
  {
    "id": "bytedance/seedance-2.0/image-to-video",
    "provider": "fal"
  },
  {
    "id": "bytedance/seedance-2.0/text-to-video",
    "provider": "fal"
  },
  {
    "id": "byteplus/seedance-1-0-lite-i2v-250428",
    "provider": "byteplus"
  },
  {
    "id": "byteplus/seedance-1-0-lite-t2v-250428",
    "provider": "byteplus"
  },
  {
    "id": "byteplus/seedance-1-0-pro-250528",
    "provider": "byteplus"
  },
  {
    "id": "byteplus/seedance-1-5-pro-251215",
    "provider": "byteplus"
  },
  {
    "id": "comfy/workflow",
    "provider": "comfy"
  },
  {
    "id": "fal-ai/heygen/v2/video-agent",
    "provider": "fal"
  },
  {
    "id": "fal-ai/kling-video/v2.1/master/text-to-video",
    "provider": "fal"
  },
  {
    "id": "fal-ai/minimax/video-01-live",
    "provider": "fal"
  },
  {
    "id": "fal-ai/wan/v2.2-a14b/image-to-video",
    "provider": "fal"
  },
  {
    "id": "fal-ai/wan/v2.2-a14b/text-to-video",
    "provider": "fal"
  },
  {
    "id": "google/veo-2.0-generate-001",
    "provider": "google"
  },
  {
    "id": "google/veo-3.0-fast-generate-001",
    "provider": "google"
  },
  {
    "id": "google/veo-3.0-generate-001",
    "provider": "google"
  },
  {
    "id": "google/veo-3.1-fast-generate-preview",
    "provider": "google"
  },
  {
    "id": "google/veo-3.1-generate-preview",
    "provider": "google"
  },
  {
    "id": "google/veo-3.1-lite-generate-preview",
    "provider": "google"
  },
  {
    "id": "kwai/Kling-2.1-Master",
    "provider": "together"
  },
  {
    "id": "minimax/Hailuo-02",
    "provider": "together"
  },
  {
    "id": "minimax/I2V-01",
    "provider": "minimax"
  },
  {
    "id": "minimax/I2V-01-Director",
    "provider": "minimax"
  },
  {
    "id": "minimax/I2V-01-live",
    "provider": "minimax"
  },
  {
    "id": "minimax/MiniMax-Hailuo-02",
    "provider": "minimax"
  },
  {
    "id": "minimax/MiniMax-Hailuo-2.3",
    "provider": "minimax"
  },
  {
    "id": "minimax/MiniMax-Hailuo-2.3-Fast",
    "provider": "minimax"
  },
  {
    "id": "openai/sora-2",
    "provider": "openai"
  },
  {
    "id": "openai/sora-2-pro",
    "provider": "openai"
  },
  {
    "id": "qwen/wan2.6-i2v",
    "provider": "qwen"
  },
  {
    "id": "qwen/wan2.6-r2v",
    "provider": "qwen"
  },
  {
    "id": "qwen/wan2.6-r2v-flash",
    "provider": "qwen"
  },
  {
    "id": "qwen/wan2.6-t2v",
    "provider": "qwen"
  },
  {
    "id": "qwen/wan2.7-r2v",
    "provider": "qwen"
  },
  {
    "id": "runway/gen3a_turbo",
    "provider": "runway"
  },
  {
    "id": "runway/gen4_aleph",
    "provider": "runway"
  },
  {
    "id": "runway/gen4_turbo",
    "provider": "runway"
  },
  {
    "id": "runway/gen4.5",
    "provider": "runway"
  },
  {
    "id": "runway/veo3",
    "provider": "runway"
  },
  {
    "id": "runway/veo3.1",
    "provider": "runway"
  },
  {
    "id": "runway/veo3.1_fast",
    "provider": "runway"
  },
  {
    "id": "vydra/kling",
    "provider": "vydra"
  },
  {
    "id": "vydra/veo3",
    "provider": "vydra"
  },
  {
    "id": "wan-ai/Wan2.2-I2V-A14B",
    "provider": "together"
  },
  {
    "id": "wan-ai/Wan2.2-T2V-A14B",
    "provider": "together"
  },
  {
    "id": "xai/grok-imagine-video",
    "provider": "xai"
  }
] as const;
