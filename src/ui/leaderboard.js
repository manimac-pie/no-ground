const API_BASE = "https://no-ground-leaderboard-api.manimacdev.workers.dev";

function getDeviceId() {
  const key = "lb_device_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID().replaceAll("-", "_");
    localStorage.setItem(key, id);
  }
  return id;
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || "api_error");
  return json;
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.error || "api_error");
  return json;
}

export async function loadLeaderboard() {
  const deviceId = getDeviceId();
  const [top, mine] = await Promise.all([
    apiGet("/api/top10"),
    apiGet(`/api/mybest?device_id=${encodeURIComponent(deviceId)}`),
  ]);
  return { entries: top.entries, myBest: mine.best_score };
}

export async function submitFinalScore(finalScore) {
  const deviceId = getDeviceId();
  const score = Math.floor(finalScore);

  const submit = await apiPost("/api/submit", { device_id: deviceId, score });
  return { deviceId, score, ...submit };
}

export async function claimName(deviceId, score, name) {
  return apiPost("/api/claim", { device_id: deviceId, score, name });
}