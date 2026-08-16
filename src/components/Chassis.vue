<script setup>
import { computed } from 'vue';

const props = defineProps({
  state: { type: String, default: 'off' },
  size: { type: String, default: 'sm' },
  chainHue: { type: [Number, String], default: undefined },
  large: { type: Boolean, default: false },
  label: { type: String, default: '' },
});

// Industrial chassis sprites generated to match the high-fidelity art direction.
// 64×64 for list sizes, 160×200 for large detail view (run state).
const SPRITES = {
  "run": "data:image/png;base64,PLACEHOLDER_RUN",
  "warn": "data:image/png;base64,PLACEHOLDER_WARN",
  "build": "data:image/png;base64,PLACEHOLDER_BUILD",
  "bad": "data:image/png;base64,PLACEHOLDER_BAD",
  "off": "data:image/png;base64,PLACEHOLDER_OFF",
  "lg-run": "data:image/png;base64,PLACEHOLDER_LG"
};

const src = computed(() => {
  if (props.large && props.state === 'run') return SPRITES['lg-run'];
  return SPRITES[props.state] || SPRITES.off;
});

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
    <!-- Status / chain LED overlay sits on top of the baked sprite LED -->
    <i class="ch-led" :class="{ chain: hasChain }" aria-hidden="true"></i>
  </span>
</template>

<style scoped>
/* Real-image industrial chassis — generated sprites + live status/chain LED */
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
/* Large run sprite is taller; contain keeps full chassis visible */
.chassis.lg .ch-img {
  object-fit: contain;
  background: #0c0d11;
}

/* Live LED bar — always present so chain-hue can tint it; otherwise matches baked state */
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

/* When chainHue is set, show a coloured LED over the image */
.ch-led.chain {
  opacity: 1;
  background: oklch(var(--chain-l, 0.72) var(--chain-c, 0.14) var(--chain-h));
  box-shadow:
    0 0 6px oklch(var(--chain-l, 0.72) var(--chain-c, 0.14) var(--chain-h) / 0.65),
    0 0 2px oklch(var(--chain-l, 0.72) var(--chain-c, 0.14) var(--chain-h) / 0.9);
}

/* State border + outer glow (the image already has internal LED colour) */
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
  0%, 100% { box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 8%, transparent), 0 0 10px color-mix(in srgb, var(--green) 38%, transparent), 0 1px 3px color-mix(in srgb, var(--ink) 15%, transparent); }
  50% { box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 8%, transparent), 0 0 14px color-mix(in srgb, var(--green) 55%, transparent), 0 1px 3px color-mix(in srgb, var(--ink) 15%, transparent); }
}
@keyframes chBuildLed {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
</style>
