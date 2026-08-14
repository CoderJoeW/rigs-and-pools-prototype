<script setup>
import { computed } from 'vue';

const props = defineProps({
  state: { type: String, default: 'off' },
  size: { type: String, default: 'sm' },
  chainHue: { type: [Number, String], default: undefined },
  large: { type: Boolean, default: false },
  label: { type: String, default: '' },
});

/* Production sprites — industrial chassis with status LED bar.
   Generated art direction, embedded so the component stays self-contained. */
const SPRITES = {
  run: "PLACEHOLDER_RUN",
  warn: "PLACEHOLDER_WARN",
  build: "PLACEHOLDER_BUILD",
  bad: "PLACEHOLDER_BAD",
  off: "PLACEHOLDER_OFF",
  lg_run: "PLACEHOLDER_LG",
};

const src = computed(() => {
  if (props.large && props.state === 'run' && SPRITES.lg_run) return SPRITES.lg_run;
  return SPRITES[props.state] || SPRITES.off;
});

const hasSprite = computed(() => !!src.value);
</script>

<template>
  <span
    class="chassis"
    :class="[state, 'sz-'+size, { lg: large, img: hasSprite }]"
    :style="chainHue !== undefined && chainHue !== null ? { '--chain-h': chainHue } : undefined"
    role="img"
    :aria-label="label || state"
  >
    <img v-if="hasSprite" class="ch-img" :src="src" alt="" draggable="false" />
    <template v-else>
      <i class="ch-led" aria-hidden="true"></i>
      <i class="ch-vent" aria-hidden="true"></i>
    </template>
    <i
      v-if="chainHue !== undefined && chainHue !== null"
      class="ch-chain"
      aria-hidden="true"
    ></i>
  </span>
</template>

<style scoped>
.chassis {
  flex: none;
  position: relative;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1.5px solid var(--line);
  background: var(--line-2);
  overflow: hidden;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 10%, transparent),
    0 1px 2px color-mix(in srgb, var(--ink) 8%, transparent);
}
.chassis.sz-md { width: 30px; height: 30px; }
.chassis.sz-lg { width: 32px; height: 32px; }
.chassis.lg { width: 40px; height: 40px; border-radius: 8px; }

.chassis.img {
  border-color: color-mix(in srgb, var(--line) 70%, transparent);
  background: #0a0a0c;
  box-shadow:
    0 1px 3px color-mix(in srgb, var(--ink) 18%, transparent),
    inset 0 0 0 1px color-mix(in srgb, #fff 6%, transparent);
}
.chassis.img.run {
  border-color: color-mix(in srgb, var(--green) 55%, transparent);
  box-shadow:
    0 0 10px color-mix(in srgb, var(--green) 35%, transparent),
    0 1px 3px color-mix(in srgb, var(--ink) 12%, transparent);
  animation: dotPulse 2.4s ease-out infinite;
}
.chassis.img.warn {
  border-color: color-mix(in srgb, var(--amber) 55%, transparent);
  box-shadow: 0 0 10px color-mix(in srgb, var(--amber) 40%, transparent);
}
.chassis.img.bad {
  border-color: color-mix(in srgb, var(--red) 55%, transparent);
  box-shadow: 0 0 10px color-mix(in srgb, var(--red) 45%, transparent);
}
.chassis.img.build {
  border-color: color-mix(in srgb, var(--blue) 55%, transparent);
  box-shadow: 0 0 10px color-mix(in srgb, var(--blue) 40%, transparent);
}
.chassis.img.off {
  opacity: 0.72;
  filter: grayscale(0.35);
}

.ch-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  pointer-events: none;
  display: block;
}

.ch-chain {
  position: absolute;
  top: 0;
  left: 12%;
  right: 12%;
  height: 3px;
  border-radius: 0 0 2px 2px;
  background: oklch(var(--chain-l) var(--chain-c) var(--chain-h));
  box-shadow: 0 0 6px oklch(var(--chain-l) var(--chain-c) var(--chain-h) / 0.55);
  z-index: 3;
  pointer-events: none;
}
.chassis.lg .ch-chain { height: 4px; left: 10%; right: 10%; }

.chassis:not(.img) .ch-led {
  position: absolute;
  top: 0;
  left: 14%;
  right: 14%;
  height: 3px;
  border-radius: 0 0 2px 2px;
  background: color-mix(in srgb, var(--ink-3) 35%, transparent);
  z-index: 2;
}
.chassis:not(.img)[style*="--chain-h"] .ch-led {
  background: oklch(var(--chain-l) var(--chain-c) var(--chain-h));
  box-shadow: 0 0 6px oklch(var(--chain-l) var(--chain-c) var(--chain-h) / 0.55);
}
.chassis:not(.img) .ch-vent {
  position: absolute;
  inset: 7px 5px 5px;
  border-radius: 2px;
  z-index: 1;
  pointer-events: none;
  background: repeating-linear-gradient(
    90deg,
    transparent 0 2px,
    color-mix(in srgb, var(--ink) 10%, transparent) 2px 3px
  );
  opacity: 0.55;
}
.chassis:not(.img).sz-lg .ch-vent { opacity: 0.8; }
.chassis:not(.img).run {
  background: var(--green);
  border-color: var(--green);
  animation: dotPulse 2.4s ease-out infinite;
}
.chassis:not(.img).run .ch-vent {
  background: repeating-linear-gradient(
    90deg,
    transparent 0 2px,
    color-mix(in srgb, #000 20%, transparent) 2px 3px
  );
  opacity: 0.4;
}
.chassis:not(.img).off { background: var(--ink-3); border-color: var(--ink-3); }
.chassis:not(.img).off .ch-led {
  background: color-mix(in srgb, var(--card) 25%, transparent);
  box-shadow: none;
}
.chassis:not(.img).bad {
  background: var(--red);
  border-color: var(--red);
  box-shadow: 0 0 8px color-mix(in srgb, var(--red) 55%, transparent);
}
.chassis:not(.img).warn {
  background: var(--amber);
  border-color: var(--amber);
  box-shadow: 0 0 8px color-mix(in srgb, var(--amber) 50%, transparent);
}
.chassis:not(.img).build {
  background: var(--blue);
  border-color: var(--blue);
  box-shadow: 0 0 8px color-mix(in srgb, var(--blue) 50%, transparent);
}
.chassis:not(.img).build .ch-led { animation: chBuildLed 1.2s ease-in-out infinite; }
@keyframes chBuildLed {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}
.chassis:not(.img).lg .ch-led { height: 4px; left: 12%; right: 12%; }
.chassis:not(.img).lg .ch-vent { inset: 10px 7px 7px; }
</style>
