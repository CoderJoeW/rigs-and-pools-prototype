<script setup lang="ts">
import { ref } from 'vue';
import { onErrorCaptured } from 'vue';
import { useGameStore } from '../stores/game.js';

/* Wraps just the active tab's view, not the whole app — TopBar and the
   bottom nav live outside this boundary, in App.vue's own template, so a
   view that throws mid-render strands only that view. The player can still
   switch tabs, and the autosave/tick intervals (also in App.vue, also
   outside this boundary) keep running untouched. */
const g = useGameStore();
const failed = ref(false);
const message = ref('');

onErrorCaptured(err => {
  failed.value = true;
  message.value = (err && err.message) ? err.message : String(err);
  console.error('Unhandled error rendering this tab:', err);
  return false; // stop propagation — render the fallback instead of crashing further up
});

function downloadBackup(){
  try{
    const blob = new Blob([g.exportSave()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'rigs-and-pools-recovery-'+new Date().toISOString().slice(0,10)+'.json';
    a.click();
    URL.revokeObjectURL(url);
  }catch(e){ console.error('backup download also failed:', e); }
}
function reload(){
  try{ location.reload(); }catch(e){}
}
</script>

<template>
  <div v-if="failed" class="card"><div class="empty">
    <h3>This tab hit an error</h3>
    <p>Autosave keeps running in the background, so your progress is safe. Try another
      tab below, download a backup just in case, or reload if it keeps happening.</p>
    <button class="btn btn-pri" style="margin-bottom:8px" @click="downloadBackup">Download backup</button>
    <button class="btn btn-ghost" @click="reload">Reload</button>
  </div></div>
  <slot v-else />
</template>
