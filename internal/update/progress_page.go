package update

// progressIndexHTML is served by a temporary nginx container while the platform recreates.
const progressIndexHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Hackploy — updating</title>
<style>
  :root { color-scheme: dark; --bg:#0b0e1c; --fg:#f5f6fa; --muted:#949bb4; --accent:#5b70c4; --track:#2a2f48; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    font-family: system-ui, sans-serif; background: var(--bg); color: var(--fg); }
  .card { width: min(420px, 92vw); padding: 28px 24px; border: 1px solid #2a2f48; border-radius: 16px; background: #12162a; }
  h1 { margin:0 0 8px; font-size: 1.25rem; font-weight: 650; }
  p { margin:0 0 18px; color: var(--muted); font-size: 0.95rem; line-height: 1.45; }
  .bar { height: 10px; border-radius: 999px; background: var(--track); overflow: hidden; }
  .fill { height: 100%; width: 0%; background: var(--accent); border-radius: 999px; transition: width .35s ease; }
  .row { display:flex; justify-content: space-between; margin-top: 10px; font-family: ui-monospace, monospace; font-size: 0.85rem; color: var(--muted); }
  .pct { color: var(--fg); font-weight: 650; }
</style>
</head>
<body>
  <div class="card">
    <h1>Updating Hackploy</h1>
    <p id="msg">Starting…</p>
    <div class="bar"><div class="fill" id="fill"></div></div>
    <div class="row"><span id="detail">—</span><span class="pct" id="pct">0%</span></div>
  </div>
<script>
async function tick() {
  try {
    const r = await fetch('/progress.json?ts=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    const pct = Math.max(0, Math.min(100, Number(j.pct) || 0));
    document.getElementById('fill').style.width = pct + '%';
    document.getElementById('pct').textContent = pct + '%';
    if (j.msg) document.getElementById('msg').textContent = j.msg;
    if (j.detail) document.getElementById('detail').textContent = j.detail;
    if (j.done) {
      document.getElementById('msg').textContent = j.msg || 'Done — reloading…';
      setTimeout(() => { location.href = '/sign-in'; }, 1200);
    }
  } catch (_) {}
}
tick();
setInterval(tick, 800);
</script>
</body>
</html>
`
