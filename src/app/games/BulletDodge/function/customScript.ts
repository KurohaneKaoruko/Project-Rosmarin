const DEFAULT_AI_SCRIPT = `// Return {dx, dy} with values between -1 and 1.
// state: { player, enemies, bullets, pickups, bounds, time, intensity, lives } (player has bombs)
// utils: { clamp, length, normalize, direction, nearestEnemy, nearestBullet, nearestPickup, avoidBullets }
const target = utils.nearestEnemy(state.player, state.enemies);
if (!target) return { dx: 0, dy: 0.2 };
const to = utils.direction(state.player, target);
const avoid = utils.avoidBullets(state.player, state.bullets);
return utils.normalize({ dx: to.dx * 0.5 + avoid.dx, dy: 0.2 + avoid.dy });
`;

function escapeHtml(source: string) {
  return source
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlightScript(source: string) {
  const escaped = escapeHtml(source);
  const pattern =
    /(\/\/.*$)|("([^"\\]|\\.)*")|('([^'\\]|\\.)*')|(\b(?:const|let|var|return|if|else|for|while|function|new|true|false|null|undefined)\b)|(\b\d+(\.\d+)?\b)/gm;
  return escaped.replace(pattern, (match, comment, dbl, _d, single, _s, keyword, number) => {
    if (comment) return `<span style="color:#94a3b8;">${comment}</span>`;
    if (dbl || single) return `<span style="color:#0f766e;">${match}</span>`;
    if (keyword) return `<span style="color:#2563eb;font-weight:600;">${keyword}</span>`;
    if (number) return `<span style="color:#a855f7;">${number}</span>`;
    return match;
  });
}

export { DEFAULT_AI_SCRIPT, highlightScript };
