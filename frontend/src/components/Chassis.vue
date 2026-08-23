<script setup lang="ts">
import { computed } from 'vue';
import run from '../assets/chassis/run.png';
import warn from '../assets/chassis/warn.png';
import build from '../assets/chassis/build.png';
import bad from '../assets/chassis/bad.png';
import off from '../assets/chassis/off.png';

const props = defineProps({
  state: { type: String, default: 'off' },
  size: { type: String, default: 'sm' },
  chainHue: { type: [Number, String], default: undefined },
  large: { type: Boolean, default: false },
  label: { type: String, default: '' },
});

const SPRITES: Record<string, string> = { run, warn, build, bad, off };

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
/* High-fidelity photoreal chassis — sized to match mockup visual weight */
.chassis {
  flex: none;
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  overflow: hidden;
  background: #0a0b0e;
  border: 1px solid #2a2d35;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 6%, transparent),
    0 2px 8px color-mix(in srgb, var(--ink) 25%, transparent);
}
.chassis.sz-md { width: 40px; height: 40px; }
.chassis.sz-lg { width: 44px; height: 44px; }
.chassis.lg {
  width: 96px;
  height: 96px;
  border-radius: 12px;
  border-width: 1px;
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

/* Soft status glow — image already carries its own LED */
.chassis.run {
  border-color: color-mix(in srgb, #3b82f6 50%, #2a2d35);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 5%, transparent),
    0 0 18px color-mix(in srgb, #3b82f6 35%, transparent),
    0 2px 8px color-mix(in srgb, var(--ink) 20%, transparent);
}
.chassis.warn {
  border-color: color-mix(in srgb, #f59e0b 55%, #2a2d35);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 5%, transparent),
    0 0 18px color-mix(in srgb, #f59e0b 40%, transparent),
    0 2px 8px color-mix(in srgb, var(--ink) 20%, transparent);
}
.chassis.bad {
  border-color: color-mix(in srgb, #ef4444 55%, #2a2d35);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 5%, transparent),
    0 0 18px color-mix(in srgb, #ef4444 42%, transparent),
    0 2px 8px color-mix(in srgb, var(--ink) 20%, transparent);
}
.chassis.build {
  border-color: color-mix(in srgb, #60a5fa 55%, #2a2d35);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 5%, transparent),
    0 0 18px color-mix(in srgb, #60a5fa 38%, transparent),
    0 2px 8px color-mix(in srgb, var(--ink) 20%, transparent);
}
.chassis.off {
  border-color: #1f2229;
  opacity: 0.88;
  filter: grayscale(0.25) brightness(0.92);
}

/* Optional chain LED overlay */
.ch-led {
  position: absolute;
  top: 6%;
  left: 18%;
  right: 18%;
  height: 4%;
  border-radius: 1px;
  background: transparent;
  z-index: 3;
  pointer-events: none;
  opacity: 0;
}
.chassis.lg .ch-led {
  top: 5%;
  height: 3.5%;
}
.ch-led.chain {
  opacity: 0.9;
  background: oklch(var(--chain-l, 0.72) var(--chain-c, 0.14) var(--chain-h));
  box-shadow:
    0 0 8px oklch(var(--chain-l, 0.72) var(--chain-c, 0.14) var(--chain-h) / 0.7),
    0 0 2px oklch(var(--chain-l, 0.72) var(--chain-c, 0.14) var(--chain-h) / 0.95);
}
</style>
