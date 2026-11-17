package update

// progressIndexHTML is served by a temporary nginx container while the platform recreates.
// Admins who started the update (localStorage / ?progress=1) see a progress bar.
// Everyone else (students) only sees a short “being updated” message.
const progressIndexHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Hackploy</title>
<style>
  @font-face {
    font-family: "Google Sans";
    src: url("/fonts/google-sans/GoogleSans-VariableFont_GRAD,opsz,wght.ttf") format("truetype");
    font-weight: 1 1000;
    font-style: normal;
    font-display: swap;
  }
  @font-face {
    font-family: "Google Sans Code";
    src: url("/fonts/google-sans-code/GoogleSansCode-VariableFont_MONO,wght.ttf") format("truetype");
    font-weight: 1 1000;
    font-style: normal;
    font-display: swap;
  }
  :root {
    color-scheme: dark;
    --bg: #0b0e1c;
    --fg: #f5f6fa;
    --muted: #949bb4;
    --accent: #5b70c4;
    --track: #2a2f48;
    --card: #12162a;
    --border: #2a2f48;
    --font-sans: "Google Sans", sans-serif;
    --font-mono: "Google Sans Code", monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-sans);
    background: radial-gradient(1200px 600px at 50% -10%, #1a2040 0%, var(--bg) 55%);
    color: var(--fg);
  }
  .card {
    width: min(440px, 92vw);
    padding: 32px 28px;
    border: 1px solid var(--border);
    border-radius: 18px;
    background: color-mix(in oklab, var(--card) 92%, transparent);
    box-shadow: 0 24px 60px rgba(0,0,0,.35);
  }
  .brand {
    font-size: 0.85rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
    margin: 0 0 14px;
    font-weight: 650;
  }
  h1 {
    margin: 0 0 10px;
    font-size: 1.45rem;
    font-weight: 650;
    letter-spacing: -0.02em;
    line-height: 1.25;
  }
  p {
    margin: 0 0 20px;
    color: var(--muted);
    font-size: 1rem;
    line-height: 1.5;
  }
  .bar {
    height: 10px;
    border-radius: 999px;
    background: var(--track);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    width: 0%;
    background: var(--accent);
    border-radius: 999px;
    transition: width .35s ease;
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 12px;
    font-family: var(--font-mono);
    font-size: 0.82rem;
    color: var(--muted);
  }
  .pct { color: var(--fg); font-weight: 650; }
  .pulse {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    margin-right: 8px;
    vertical-align: middle;
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: .35; transform: scale(.9); }
    50% { opacity: 1; transform: scale(1.1); }
  }
  .admin-only { display: none; }
  body.is-admin .admin-only { display: block; }
  body.is-admin .student-only { display: none; }
</style>
</head>
<body>
  <div class="card">
    <p class="brand">Hackploy</p>
    <h1 id="title">Updating…</h1>
    <p id="msg" class="student-only"><span class="pulse"></span>The platform is being updated. Please wait a moment.</p>
    <p id="admin-msg" class="admin-only">Starting…</p>
    <div class="admin-only">
      <div class="bar"><div class="fill" id="fill"></div></div>
      <div class="row"><span id="detail">—</span><span class="pct" id="pct">0%</span></div>
    </div>
  </div>
<script>
(function () {
  var i18n = {
    en: {
      title: "Updating Hackploy",
      student: "The platform is being updated. Please wait a moment.",
      starting: "Starting…",
      done: "Done — reloading…"
    },
    uz: {
      title: "Hackploy yangilanmoqda",
      student: "Platforma yangilanmoqda. Iltimos, biroz kuting.",
      starting: "Boshlanmoqda…",
      done: "Tayyor — qayta yuklanmoqda…"
    }
  };

  function readLang() {
    try {
      var fromLs = localStorage.getItem("hackploy_lang");
      if (fromLs === "uz" || fromLs === "en") return fromLs;
    } catch (_) {}
    var m = document.cookie.match(/(?:^|; )hackploy_lang=([^;]*)/);
    if (m && (m[1] === "uz" || m[1] === "en")) return m[1];
    return "en";
  }

  function isAdminView() {
    try {
      if (localStorage.getItem("hackploy_update_admin") === "1") return true;
    } catch (_) {}
    return new URLSearchParams(location.search).get("progress") === "1";
  }

  var lang = readLang();
  var t = i18n[lang] || i18n.en;
  var admin = isAdminView();
  document.documentElement.lang = lang;
  document.title = t.title;
  document.getElementById("title").textContent = t.title;
  document.getElementById("msg").innerHTML = '<span class="pulse"></span>' + t.student;
  document.getElementById("admin-msg").textContent = t.starting;
  if (admin) document.body.classList.add("is-admin");

  async function tick() {
    try {
      var r = await fetch("/progress.json?ts=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return;
      var j = await r.json();
      var pct = Math.max(0, Math.min(100, Number(j.pct) || 0));
      if (admin) {
        document.getElementById("fill").style.width = pct + "%";
        document.getElementById("pct").textContent = pct + "%";
        if (j.msg) document.getElementById("admin-msg").textContent = j.msg;
        if (j.detail) document.getElementById("detail").textContent = j.detail;
      }
      if (j.done) {
        if (admin) document.getElementById("admin-msg").textContent = j.msg || t.done;
        else document.getElementById("msg").innerHTML = '<span class="pulse"></span>' + t.done;
        try { localStorage.removeItem("hackploy_update_admin"); } catch (_) {}
        setTimeout(function () { location.href = "/sign-in"; }, 1200);
      }
    } catch (_) {}
  }
  tick();
  setInterval(tick, 800);
})();
</script>
</body>
</html>
`
