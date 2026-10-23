import { SETUP_IDS, SETUPS, type SetupId } from '@cryptopulse/shared';
import { fmtNum } from '../lib/format';
import { MAX_SCORE } from '../lib/scoring';

export function scoreBars(scores: Record<SetupId, number>, best: SetupId, cls = '') {
  const rows = SETUP_IDS.map((k) => `
    <div class="sbar ${k === best ? 'win' : ''}">
      <span class="sbar-k">${SETUPS[k].name}</span>
      <span class="sbar-track"><span class="sbar-fill" style="--w:${((scores[k] / MAX_SCORE) * 100).toFixed(1)}%"></span></span>
      <span class="sbar-v n-only">${fmtNum(scores[k])}</span>
    </div>`).join('');
  return `<div class="sbars ${cls}">${rows}</div>`;
}

export function viewBuilding(scores: Record<SetupId, number>, best: SetupId) {
  return `
  <div class="qcard">
    <p class="eyebrow">Almost there</p>
    <h2 class="qtitle" id="screen-title" tabindex="-1">Matching your answers to 3 setups</h2>
    ${scoreBars(scores, best)}
    <p class="qhint qhint--flat">Each answer adds points to one or more setups. Your goal counts the most.</p>
  </div>`;
}
