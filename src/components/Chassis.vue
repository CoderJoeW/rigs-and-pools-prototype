<script setup>
import { computed } from 'vue';

const props = defineProps({
  state: { type: String, default: 'off' },
  size: { type: String, default: 'sm' },
  chainHue: { type: [Number, String], default: undefined },
  large: { type: Boolean, default: false },
  label: { type: String, default: '' },
});

// Generated industrial chassis sprites (64×64). Same art direction as the CSS bridge.
const SPRITES = {
  "run": "data:image/png;base64,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",
  "warn": "data:image/png;base64,PLACEHOLDER",
  "build": "data:image/png;base64,PLACEHOLDER",
  "bad": "data:image/png;base64,PLACEHOLDER",
  "off": "data:image/png;base64,PLACEHOLDER",
};

const src = computed(() => SPRITES[props.state] || SPRITES.off);

const hasChain = computed(() => props.chainHue !== undefined && props.chainHue !== null);
</script>

<template>
  <span
    class="chassis"
    :class="[state, 'sz-'+size, { lg: large, img: true }]"
    :style="hasChain ? { '--chain-h': chainHue } : undefined"
    role="img"
    :aria-label="label || state"
  >
    <img class="ch-img" :src="src" alt="" aria-hidden="true" />
    <i class="ch-led" :class="{ chain: hasChain }" aria-hidden="true"></i>
  </span>
</template>

<style scoped>
/* Real-image industrial chassis — generated PNG sprites + live chain/status LED */
.chassis {
  flex: none;
  position: relative;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  overflow: hidden;
  background: #0c0d11;
  border: 1.5px solid #3a3e48;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 10%, transparent),
    0 1px 3px color-mix(in srgb, var(--ink) 20%, transparent);
}
.chassis.sz-md { width: 30px; height: 30px; }
.chassis.sz-lg { width: 32px; height: 32px; }
.chassis.lg {
  width: 42px;
  height: 42px;
  border-radius: 8px;
}

.ch-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  pointer-events: none;
  z-index: 0;
  display: block;
}

.ch-led {
  position: absolute;
  top: 3px;
  left: 14%;
  right: 14%;
  height: 3px;
  border-radius: 1px;
  background: transparent;
  z-index: 3;
  pointer-events: none;
  box-shadow: none;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.chassis.lg .ch-led {
  top: 4px;
  height: 4px;
  left: 12%;
  right: 12%;
}

.ch-led.chain {
  opacity: 1;
  background: oklch(var(--chain-l, 0.72) var(--chain-c, 0.14) var(--chain-h));
  box-shadow:
    0 0 6px oklch(var(--chain-l, 0.72) var(--chain-c, 0.14) var(--chain-h) / 0.65),
    0 0 2px oklch(var(--chain-l, 0.72) var(--chain-c, 0.14) var(--chain-h) / 0.9);
}

.chassis.run {
  border-color: color-mix(in srgb, var(--green) 65%, #3a3e48);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 8%, transparent),
    0 0 10px color-mix(in srgb, var(--green) 38%, transparent),
    0 1px 3px color-mix(in srgb, var(--ink) 15%, transparent);
  animation: chassisPulse 2.4s ease-out infinite;
}
.chassis.warn {
  border-color: color-mix(in srgb, var(--amber) 65%, #3a3e48);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 6%, transparent),
    0 0 10px color-mix(in srgb, var(--amber) 42%, transparent);
}
.chassis.bad {
  border-color: color-mix(in srgb, var(--red) 65%, #3a3e48);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 6%, transparent),
    0 0 10px color-mix(in srgb, var(--red) 48%, transparent);
}
.chassis.build {
  border-color: color-mix(in srgb, var(--blue) 65%, #3a3e48);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 6%, transparent),
    0 0 10px color-mix(in srgb, var(--blue) 42%, transparent);
}
.chassis.build .ch-led:not(.chain) {
  opacity: 0.85;
  background: var(--blue);
  box-shadow: 0 0 5px color-mix(in srgb, var(--blue) 75%, transparent);
  animation: chBuildLed 1.2s ease-in-out infinite;
}
.chassis.off {
  border-color: #2a2d35;
  opacity: 0.82;
  filter: grayscale(0.35) brightness(0.88);
}

@keyframes chassisPulse {
  0%, 100% {
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, #fff 8%, transparent),
      0 0 10px color-mix(in srgb, var(--green) 38%, transparent),
      0 1px 3px color-mix(in srgb, var(--ink) 15%, transparent);
  }
  50% {
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, #fff 8%, transparent),
      0 0 14px color-mix(in srgb, var(--green) 55%, transparent),
      0 1px 3px color-mix(in srgb, var(--ink) 15%, transparent);
  }
}
@keyframes chBuildLed {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
</style>
