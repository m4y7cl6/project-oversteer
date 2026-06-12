/* Dump node/mesh/material/texture info from .glb files (JSON chunk only).
 * Usage: node scripts/inspect-glb.cjs <file.glb> [...]
 */
const fs = require('fs');

for (const file of process.argv.slice(2)) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) { console.log(`${file}: not GLB`); continue; }
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  console.log(`=== ${file}`);
  console.log('nodes:', (json.nodes || []).map((n) => {
    const bits = [n.name || '?'];
    if (n.mesh !== undefined) bits.push('mesh');
    if (n.translation) bits.push(`t=[${n.translation.map((v) => v.toFixed(2)).join(',')}]`);
    return bits.join(':');
  }).join(' | '));
  console.log('materials:', (json.materials || []).map((m) => {
    const c = m.pbrMetallicRoughness && m.pbrMetallicRoughness.baseColorFactor;
    const tex = m.pbrMetallicRoughness && m.pbrMetallicRoughness.baseColorTexture ? 'TEX' : '';
    return `${m.name || '?'}${c ? ` rgb(${c.slice(0, 3).map((v) => Math.round(v * 255)).join(',')})` : ''}${tex}`;
  }).join(' | '));
  console.log('images:', (json.images || []).map((i) => i.uri || i.name || 'embedded').join(', ') || 'none');
}
