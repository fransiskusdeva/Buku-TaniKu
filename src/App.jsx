import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Plus, X, Wallet, TrendingUp, TrendingDown, Sprout, Settings2,
  Trash2, Pencil, ChevronLeft, ChevronRight, Users, Loader2, AlertCircle,
  Package, Lock, ShoppingBag, Hammer, History, PiggyBank, AlertTriangle,
  Eye, EyeOff, LogOut
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";

// ---------- constants ----------

const CAT_BELI_PUPUK = "c-beli-pupuk";
const CAT_PEMUPUKAN = "c-pemupukan";
const CAT_SALDO = "c-saldo";

const DEFAULT_CATEGORIES = [
  { id: "c-bibit", name: "Bibit", type: "expense" },
  { id: "c-pestisida", name: "Pestisida", type: "expense" },
  { id: "c-tenagakerja", name: "Tenaga Kerja", type: "expense" },
  { id: "c-sewaalat", name: "Sewa Alat/Lahan", type: "expense" },
  { id: "c-irigasi", name: "Irigasi/Air", type: "expense" },
  { id: "c-lainexp", name: "Lainnya", type: "expense" },
  { id: "c-panen", name: "Hasil Panen", type: "income" },
  { id: "c-jualaset", name: "Penjualan Aset", type: "income" },
  { id: "c-laininc", name: "Lainnya", type: "income" },
  { id: CAT_BELI_PUPUK, name: "Pembelian Pupuk (Stok)", type: "expense", locked: true },
  { id: CAT_PEMUPUKAN, name: "Pemupukan (Pupuk + Kerja)", type: "expense", locked: true },
  { id: CAT_SALDO, name: "Input Saldo", type: "income", locked: true },
];

const CURRENT_YEAR = new Date().getFullYear();
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const GOLD = "#C99A2E";
const GREEN = "#4C6B3D";
const RUST = "#8B3A2A";
const FOREST = "#1F2E1D";
const CARD = "#F6F3E7";
const BASE = "#EFEAD9";
const INK = "#2A2A22";

const PIE_COLORS = ["#4C6B3D", "#C99A2E", "#8B3A2A", "#6B8E4E", "#A67C2E", "#5B4A2F", "#7A9B57", "#B5651D"];

function rupiah(n) {
  const v = Math.round(n || 0);
  return "Rp " + v.toLocaleString("id-ID");
}

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function uid(prefix) {
  return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function weightedAvg(oldKg, oldHarga, addKg, addHargaPerKg) {
  if (oldKg <= 0) return addHargaPerKg;
  return (oldKg * oldHarga + addKg * addHargaPerKg) / (oldKg + addKg);
}

function txYear(t) {
  return t.date ? Number(t.date.slice(0, 4)) : null;
}
function txMonth(t) {
  return t.date ? Number(t.date.slice(5, 7)) : null;
}
function periodFilter(list, year, month) {
  return list.filter((t) => {
    if (txYear(t) !== year) return false;
    if (month != null && txMonth(t) !== month) return false;
    return true;
  });
}
function availableYears(list) {
  const set = new Set(list.filter((t) => t.date).map((t) => txYear(t)));
  return Array.from(set).sort((a, b) => b - a);
}

// ---------- supabase storage ----------

const SUPABASE_URL = "https://tpileafkakqkmnuttziu.supabase.co";
const SUPABASE_KEY = "sb_publishable_MQQsoKpXOBIGlDihARUYnw_TgiXUCst";
const SB_HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

async function kvGet(key) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/kv_store?key=eq.${encodeURIComponent(key)}&select=value`,
    { headers: SB_HEADERS }
  );
  if (!res.ok) throw new Error("Gagal mengambil data");
  const rows = await res.json();
  return rows.length > 0 ? rows[0].value : null;
}

async function kvSet(key, value) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/kv_store?on_conflict=key`, {
    method: "POST",
    headers: { ...SB_HEADERS, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ key, value, updated_at: new Date().toISOString() }]),
  });
  if (!res.ok) throw new Error("Gagal menyimpan data");
  return true;
}

// ---------- autentikasi (username unik + password sebagai kode akses) ----------

async function hashPassword(username, password) {
  const enc = new TextEncoder();
  const data = enc.encode("buku-tani::" + username.toLowerCase() + "::" + password);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function findUser(username) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/app_users?username=eq.${encodeURIComponent(username.toLowerCase())}&select=username,password_hash`,
    { headers: SB_HEADERS }
  );
  if (!res.ok) throw new Error("Gagal cek akun");
  const rows = await res.json();
  return rows.length > 0 ? rows[0] : null;
}

async function createUser(username, password) {
  const password_hash = await hashPassword(username, password);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/app_users`, {
    method: "POST",
    headers: { ...SB_HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify([{ username: username.toLowerCase(), password_hash, last_active: new Date().toISOString() }]),
  });
  if (!res.ok) throw new Error("Gagal membuat akun");
}

async function touchActivity(username) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/app_users?username=eq.${encodeURIComponent(username.toLowerCase())}`, {
      method: "PATCH",
      headers: { ...SB_HEADERS, Prefer: "return=minimal" },
      body: JSON.stringify({ last_active: new Date().toISOString() }),
    });
  } catch (e) {
    // gagal update jejak aktivitas bukan hal fatal, biarkan
  }
}

const LS_SESSION_KEY = "buku-tani-session";

// polling ringan tiap 12 detik biar device lain ikut keupdate tanpa refresh manual
const POLL_INTERVAL_MS = 12000;

function useSharedState(key, initialValue) {
  const [value, setValue] = useState(initialValue);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const skipNextPoll = React.useRef(false);

  const fetchLatest = useCallback(async (isInitial) => {
    try {
      const val = await kvGet(key);
      if (val !== null) setValue(val);
    } catch (e) {
      // biarkan, data lokal tetap dipakai; error simpan ditangani terpisah di persist()
    } finally {
      if (isInitial) setLoaded(true);
    }
  }, [key]);

  useEffect(() => {
    fetchLatest(true);
    const interval = setInterval(() => {
      if (skipNextPoll.current) { skipNextPoll.current = false; return; }
      fetchLatest(false);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchLatest]);

  const persist = useCallback(async (newValue) => {
    setValue(newValue);
    skipNextPoll.current = true; // hindari polling nimpa balik nilai yang baru saja disimpan
    try {
      await kvSet(key, newValue);
      setError(null);
    } catch (e) {
      setError("Gagal menyimpan data. Cek koneksi internet lalu coba lagi.");
    }
  }, [key]);

  return [value, persist, loaded, error];
}

// ---------- small UI atoms ----------

function IconBtn({ onClick, children, title, danger }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 34, height: 34, borderRadius: 10, border: "1px solid rgba(42,42,34,0.12)",
        background: "#fff", cursor: "pointer", color: danger ? RUST : INK,
        transition: "transform .12s ease, background .12s ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = danger ? "#fbeae6" : "#f0ede0"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
    >
      {children}
    </button>
  );
}

function PrimaryBtn({ onClick, children, style }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "10px 16px", borderRadius: 12, border: "none",
        background: FOREST, color: "#F6F3E7", fontWeight: 600, fontSize: 14,
        cursor: "pointer", boxShadow: "0 2px 8px rgba(31,46,29,0.25)",
        transition: "transform .12s ease",
        ...style,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
    >
      {children}
    </button>
  );
}

function ConfirmModal({ title, message, onConfirm, onCancel }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(31,46,29,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 60, padding: 16,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FBF9F1", borderRadius: 16, width: "100%", maxWidth: 340,
          padding: 22, boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
        }}
      >
        <h3 style={{ margin: "0 0 8px", fontFamily: "'Fraunces', serif", fontSize: 18, color: FOREST }}>{title}</h3>
        <p style={{ margin: "0 0 20px", fontSize: 14, color: "#5A5A4A", lineHeight: 1.4 }}>{message}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid rgba(31,46,29,0.2)",
            background: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#5A5A4A",
          }}>Batal</button>
          <button onClick={onConfirm} style={{
            flex: 1, padding: "10px 0", borderRadius: 10, border: "none",
            background: RUST, color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700,
          }}>Hapus</button>
        </div>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(31,46,29,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 50, padding: 16, backdropFilter: "blur(2px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FBF9F1", borderRadius: 18, width: "100%",
          maxWidth: wide ? 560 : 420, maxHeight: "88vh", overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)", border: "1px solid rgba(31,46,29,0.08)",
        }}
      >
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 20px", borderBottom: "1px solid rgba(31,46,29,0.1)",
          position: "sticky", top: 0, background: "#FBF9F1", borderRadius: "18px 18px 0 0",
        }}>
          <h3 style={{ margin: 0, fontFamily: "'Fraunces', serif", fontSize: 20, color: FOREST }}>{title}</h3>
          <IconBtn onClick={onClose} title="Tutup"><X size={17} /></IconBtn>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

function FieldLabel({ children }) {
  return <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#5A5A4A", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>{children}</label>;
}

const inputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1px solid rgba(31,46,29,0.18)", fontSize: 15, background: "#fff",
  fontFamily: "'Public Sans', sans-serif", color: INK, boxSizing: "border-box",
};

// ---------- Petak (plot) selector tile ----------

function PetakTile({ label, net, active, onClick, isGlobal }) {
  const positive = net >= 0;
  return (
    <button
      onClick={onClick}
      style={{
        position: "relative", minWidth: isGlobal ? 128 : 116, height: 78,
        borderRadius: 14, border: active ? `2px solid ${GOLD}` : "1px solid rgba(31,46,29,0.15)",
        background: active
          ? `linear-gradient(160deg, ${FOREST} 0%, #2C4028 100%)`
          : "#FBF9F1",
        color: active ? "#F6F3E7" : INK,
        cursor: "pointer", padding: "10px 12px", textAlign: "left",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        boxShadow: active ? "0 6px 16px rgba(31,46,29,0.3)" : "0 1px 3px rgba(31,46,29,0.08)",
        transition: "transform .15s ease, box-shadow .15s ease", flexShrink: 0,
        overflow: "hidden",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
    >
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0, height: 5,
        background: isGlobal ? GOLD : (positive ? GREEN : RUST),
        opacity: active ? 0.9 : 0.55,
      }} />
      <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>{label}</span>
      {!isGlobal && (
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5,
          color: active ? (positive ? "#B7D89A" : "#E8B4A4") : (positive ? GREEN : RUST),
          fontWeight: 600,
        }}>
          {positive ? "+" : ""}<Amt>{rupiah(net)}</Amt>
        </span>
      )}
    </button>
  );
}

// ---------- sensor nilai (blur) ----------

const BlurContext = React.createContext(false);
function useBlur() { return React.useContext(BlurContext); }
function Amt({ children, style }) {
  const hide = useBlur();
  return (
    <span style={hide ? { ...style, filter: "blur(7px)", userSelect: "none", transition: "filter .15s" } : style}>
      {children}
    </span>
  );
}

// ---------- Login ----------

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmingNew, setConfirmingNew] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const uname = username.trim();
    if (!uname || !password) { setError("Isi username dan password dulu ya."); return; }
    setLoading(true);
    try {
      const existing = await findUser(uname);
      if (existing) {
        const hash = await hashPassword(uname, password);
        if (hash === existing.password_hash) {
          await touchActivity(uname);
          onLogin(uname);
        } else {
          setError("Password salah.");
        }
      } else {
        setConfirmingNew(true);
      }
    } catch (e) {
      setError("Gagal terhubung. Cek koneksi internet lalu coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateNew() {
    setLoading(true);
    setError("");
    try {
      await createUser(username.trim(), password);
      onLogin(username.trim());
    } catch (e) {
      setError("Gagal membuat akun. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", background: BASE, display: "flex", alignItems: "center",
      justifyContent: "center", padding: 20, fontFamily: "'Public Sans', sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Public+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
      `}</style>
      <div style={{
        width: "100%", maxWidth: 380, background: "#FBF9F1", borderRadius: 20,
        padding: "32px 26px", boxShadow: "0 10px 30px rgba(31,46,29,0.15)", border: "1px solid rgba(31,46,29,0.08)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, background: FOREST,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Sprout size={22} color={GOLD} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontFamily: "'Fraunces', serif", fontSize: 22, color: FOREST }}>Buku Tani</h1>
            <span style={{ fontSize: 12.5, color: "#8A8A78" }}>Masuk pakai username & password</span>
          </div>
        </div>

        {!confirmingNew ? (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 14 }}>
              <FieldLabel>Username</FieldLabel>
              <input
                style={inputStyle} value={username} autoCapitalize="none" autoCorrect="off"
                onChange={(e) => setUsername(e.target.value)} placeholder="mis. usahatani-budi"
              />
            </div>
            <div style={{ marginBottom: 18 }}>
              <FieldLabel>Password</FieldLabel>
              <input
                style={inputStyle} type="password" value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="kode akses kamu"
              />
            </div>
            {error && <p style={{ color: RUST, fontSize: 13, margin: "0 0 14px" }}>{error}</p>}
            <PrimaryBtn onClick={handleSubmit} style={{ width: "100%", justifyContent: "center" }}>
              {loading ? "Memeriksa..." : "Masuk"}
            </PrimaryBtn>
            <p style={{ fontSize: 12, color: "#8A8A78", marginTop: 14, textAlign: "center" }}>
              Username belum ada? Isi aja bebas — nanti ditawarin buat buku baru otomatis.
            </p>
          </form>
        ) : (
          <div>
            <p style={{ fontSize: 14, color: "#3A3A2E", marginBottom: 18 }}>
              Username <b>{username}</b> belum ada. Mau buat buku baru dengan username & password ini?
            </p>
            {error && <p style={{ color: RUST, fontSize: 13, margin: "0 0 14px" }}>{error}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <PrimaryBtn onClick={handleCreateNew} style={{ flex: 1, justifyContent: "center" }}>
                {loading ? "Membuat..." : "Ya, Buat Buku Baru"}
              </PrimaryBtn>
              <button
                onClick={() => { setConfirmingNew(false); setError(""); }}
                style={{
                  padding: "10px 16px", borderRadius: 12, border: "1px solid rgba(31,46,29,0.2)",
                  background: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#5A5A4A",
                }}
              >
                Batal
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Main App ----------

function Dashboard({ username, onLogout }) {
  const key = (k) => `${username}:${k}`;
  const [lahanList, setLahanList, lahanLoaded] = useSharedState(key("lahan-list"), []);
  const [categories, setCategories, catLoaded] = useSharedState(key("category-list"), DEFAULT_CATEGORIES);
  const [transactions, setTransactions, txLoaded, txError] = useSharedState(key("transactions"), []);
  const [stokPupuk, setStokPupuk, stokLoaded] = useSharedState(key("stok-pupuk"), []);
  const [hideAmounts, setHideAmounts] = useState(() => localStorage.getItem("buku-tani-hide") === "1");

  useEffect(() => {
    localStorage.setItem("buku-tani-hide", hideAmounts ? "1" : "0");
  }, [hideAmounts]);

  useEffect(() => {
    touchActivity(username);
    const interval = setInterval(() => touchActivity(username), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [username]);

  const [selectedLahan, setSelectedLahan] = useState("all"); // 'all' or lahan id
  const [showTxModal, setShowTxModal] = useState(false);
  const [txPreset, setTxPreset] = useState(null); // preset type for quick-add shortcuts
  const [showLahanModal, setShowLahanModal] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);
  const [showStokModal, setShowStokModal] = useState(false);
  const [showBeliModal, setShowBeliModal] = useState(false);
  const [showPemupukanModal, setShowPemupukanModal] = useState(false);
  const [showSaldoModal, setShowSaldoModal] = useState(false);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [showFabMenu, setShowFabMenu] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const ready = lahanLoaded && catLoaded && txLoaded && stokLoaded;

  // seed default categories only after load confirms empty AND catLoaded true and no existing write happened
  useEffect(() => {
    if (catLoaded && categories.length === 0) {
      setCategories(DEFAULT_CATEGORIES);
    }
    // eslint-disable-next-line
  }, [catLoaded]);

  // pastikan kategori terkunci (pembelian pupuk & pemupukan) selalu ada, walau data lama belum punya
  useEffect(() => {
    if (catLoaded && categories.length > 0) {
      const missing = DEFAULT_CATEGORIES.filter((d) => d.locked && !categories.find((c) => c.id === d.id));
      if (missing.length > 0) setCategories([...categories, ...missing]);
    }
    // eslint-disable-next-line
  }, [catLoaded, categories.length]);

  const lahanMap = useMemo(() => {
    const m = {};
    lahanList.forEach((l) => (m[l.id] = l));
    return m;
  }, [lahanList]);

  const catMap = useMemo(() => {
    const m = {};
    categories.forEach((c) => (m[c.id] = c));
    return m;
  }, [categories]);

  function netForLahan(lahanId) {
    return transactions.reduce((sum, t) => {
      if (lahanId !== "all" && t.lahanId !== lahanId) return sum;
      if (txYear(t) !== CURRENT_YEAR) return sum;
      return sum + (t.type === "income" ? t.amount : -t.amount);
    }, 0);
  }

  const filteredTx = useMemo(() => {
    return transactions
      .filter((t) => (selectedLahan === "all" || t.lahanId === selectedLahan) && txYear(t) === CURRENT_YEAR)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [transactions, selectedLahan]);

  const isGlobalView = selectedLahan === "all";

  const saldoKas = useMemo(() => {
    return transactions.reduce((sum, t) => {
      if (t.type === "income") return sum + t.amount;
      return sum - (t.cashAmount !== undefined ? t.cashAmount : t.amount);
    }, 0);
  }, [transactions]);

  const totals = useMemo(() => {
    let income = 0, expenseCash = 0, expenseFull = 0;
    filteredTx.forEach((t) => {
      if (t.type === "income") {
        if (t.categoryId !== CAT_SALDO) income += t.amount;
      } else {
        expenseFull += t.amount;
        expenseCash += (t.cashAmount !== undefined ? t.cashAmount : t.amount);
      }
    });
    const expense = isGlobalView ? expenseCash : expenseFull;
    return { income, expense, net: income - expense };
  }, [filteredTx, isGlobalView]);

  const chartData = useMemo(() => {
    const byCat = {};
    filteredTx.forEach((t) => {
      if (t.type !== "expense") return;
      const name = catMap[t.categoryId]?.name || "Lainnya";
      byCat[name] = (byCat[name] || 0) + t.amount;
    });
    return Object.entries(byCat)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredTx, catMap]);

  const lahanCompareData = useMemo(() => {
    const yearTx = transactions.filter((t) => txYear(t) === CURRENT_YEAR);
    return lahanList.map((l) => ({
      name: l.name,
      Pemasukan: yearTx.filter((t) => t.lahanId === l.id && t.type === "income").reduce((s, t) => s + t.amount, 0),
      Pengeluaran: yearTx.filter((t) => t.lahanId === l.id && t.type === "expense").reduce((s, t) => s + t.amount, 0),
    }));
  }, [transactions, lahanList]);

  async function saveTx(tx) {
    if (tx.id) {
      await setTransactions(transactions.map((t) => (t.id === tx.id ? tx : t)));
    } else {
      await setTransactions([...transactions, { ...tx, id: uid("tx") }]);
    }
    setShowTxModal(false);
    setEditingTx(null);
  }

  const stokMap = useMemo(() => {
    const m = {};
    stokPupuk.forEach((s) => (m[s.id] = s));
    return m;
  }, [stokPupuk]);

  async function deleteTx(id) {
    const t = transactions.find((x) => x.id === id);
    if (t && t.kind === "pupuk_purchase") {
      // batalkan pembelian: kurangi stok kembali
      await setStokPupuk(stokPupuk.map((s) => (
        s.id === t.pupukId ? { ...s, stokKg: Math.max(0, s.stokKg - t.kg) } : s
      )));
    } else if (t && t.kind === "pupuk_usage") {
      // batalkan pemakaian: kembalikan kg ke stok
      await setStokPupuk(stokPupuk.map((s) => (
        s.id === t.pupukId ? { ...s, stokKg: s.stokKg + t.kg } : s
      )));
    }
    await setTransactions(transactions.filter((t) => t.id !== id));
  }

  async function addPupukJenis(nama) {
    const item = { id: uid("pupuk"), nama: nama.trim(), stokKg: 0, hargaPerKg: 0 };
    await setStokPupuk([...stokPupuk, item]);
    return item.id;
  }

  async function purchasePupuk({ id, pupukId, newPupukName, kg, totalHarga, date, note }) {
    let targetId = pupukId;
    let list = stokPupuk;
    const oldTx = id ? transactions.find((t) => t.id === id) : null;
    if (oldTx) {
      // batalkan efek transaksi lama dulu sebelum menerapkan yang baru
      list = list.map((s) => (
        s.id === oldTx.pupukId ? { ...s, stokKg: Math.max(0, s.stokKg - oldTx.kg) } : s
      ));
    }
    if (!targetId && newPupukName) {
      targetId = uid("pupuk");
      list = [...list, { id: targetId, nama: newPupukName.trim(), stokKg: 0, hargaPerKg: 0 }];
    }
    const item = list.find((s) => s.id === targetId);
    if (!item || !kg || kg <= 0 || !totalHarga || totalHarga <= 0) return;
    const hargaPerKgBeli = totalHarga / kg;
    const newHarga = weightedAvg(item.stokKg, item.hargaPerKg, kg, hargaPerKgBeli);
    const newList = list.map((s) => (
      s.id === targetId ? { ...s, stokKg: s.stokKg + kg, hargaPerKg: newHarga } : s
    ));
    await setStokPupuk(newList);
    const txObj = {
      id: id || uid("tx"), kind: "pupuk_purchase", type: "expense", lahanId: null,
      categoryId: CAT_BELI_PUPUK, amount: totalHarga, cashAmount: totalHarga,
      pupukId: targetId, pupukNama: item.nama, kg, date, note: note?.trim() || "",
    };
    if (id) {
      await setTransactions(transactions.map((t) => (t.id === id ? txObj : t)));
    } else {
      await setTransactions([...transactions, txObj]);
    }
    setShowBeliModal(false);
    setEditingTx(null);
  }

  async function usePupuk({ id, lahanId, pupukId, kg, laborCost, date, note }) {
    let list = stokPupuk;
    const oldTx = id ? transactions.find((t) => t.id === id) : null;
    if (oldTx) {
      list = list.map((s) => (
        s.id === oldTx.pupukId ? { ...s, stokKg: s.stokKg + oldTx.kg } : s
      ));
    }
    const item = list.find((s) => s.id === pupukId);
    if (!item || !lahanId || !kg || kg <= 0 || kg > item.stokKg) return;
    const cost = laborCost && laborCost > 0 ? laborCost : 0;
    const pupukCost = kg * item.hargaPerKg;
    const newList = list.map((s) => (
      s.id === pupukId ? { ...s, stokKg: s.stokKg - kg } : s
    ));
    await setStokPupuk(newList);
    const txObj = {
      id: id || uid("tx"), kind: "pupuk_usage", type: "expense", lahanId,
      categoryId: CAT_PEMUPUKAN, amount: pupukCost + cost, cashAmount: cost,
      pupukId, pupukNama: item.nama, kg, pupukCost, laborCost: cost,
      date, note: note?.trim() || "",
    };
    if (id) {
      await setTransactions(transactions.map((t) => (t.id === id ? txObj : t)));
    } else {
      await setTransactions([...transactions, txObj]);
    }
    setShowPemupukanModal(false);
    setEditingTx(null);
  }

  async function inputSaldo({ id, amount, date, note }) {
    if (!amount || amount <= 0) return;
    const txObj = {
      id: id || uid("tx"), kind: "saldo_input", type: "income", lahanId: null,
      categoryId: CAT_SALDO, amount, cashAmount: amount,
      date, note: note?.trim() || "",
    };
    if (id) {
      await setTransactions(transactions.map((t) => (t.id === id ? txObj : t)));
    } else {
      await setTransactions([...transactions, txObj]);
    }
    setShowSaldoModal(false);
    setEditingTx(null);
  }

  function openEditFor(t) {
    setEditingTx(t);
    if (!t.kind) { setTxPreset(null); setShowTxModal(true); }
    else if (t.kind === "pupuk_purchase") setShowBeliModal(true);
    else if (t.kind === "pupuk_usage") setShowPemupukanModal(true);
    else if (t.kind === "saldo_input") setShowSaldoModal(true);
  }

  function requestDeleteTx(id) {
    setConfirmDeleteId(id);
  }

  async function confirmDelete() {
    if (confirmDeleteId) {
      await deleteTx(confirmDeleteId);
      setConfirmDeleteId(null);
    }
  }

  async function saveLahan(lahan) {
    if (lahan.id) {
      await setLahanList(lahanList.map((l) => (l.id === lahan.id ? lahan : l)));
    } else {
      await setLahanList([...lahanList, { ...lahan, id: uid("lahan") }]);
    }
  }

  async function deleteLahan(id) {
    await setLahanList(lahanList.filter((l) => l.id !== id));
    await setTransactions(transactions.filter((t) => t.lahanId !== id));
    if (selectedLahan === id) setSelectedLahan("all");
  }

  async function saveCategory(cat) {
    if (cat.id) {
      await setCategories(categories.map((c) => (c.id === cat.id ? cat : c)));
    } else {
      await setCategories([...categories, { ...cat, id: uid("cat") }]);
    }
  }

  async function deleteCategory(id) {
    await setCategories(categories.filter((c) => c.id !== id));
  }

  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: BASE }}>
        <Loader2 className="animate-spin" size={28} color={FOREST} />
      </div>
    );
  }

  return (
    <BlurContext.Provider value={hideAmounts}>
    <div style={{
      minHeight: "100vh", background: BASE, color: INK,
      fontFamily: "'Public Sans', sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Public+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap');
        * { box-sizing: border-box; }
        ::selection { background: ${GOLD}; color: ${FOREST}; }
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        button:focus-visible, input:focus-visible, select:focus-visible {
          outline: 2px solid ${GOLD}; outline-offset: 2px;
        }
      `}</style>

      {/* Header */}
      <header style={{ background: FOREST, color: "#F6F3E7", padding: "22px 20px 26px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10, background: "rgba(201,154,46,0.18)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Sprout size={20} color={GOLD} />
              </div>
              <div>
                <h1 style={{ margin: 0, fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700 }}>Buku Tani</h1>
                <span style={{ fontSize: 12, opacity: 0.65, display: "flex", alignItems: "center", gap: 4 }}>
                  <Users size={11} /> data bersama tim
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <IconBtn onClick={() => setHideAmounts((v) => !v)} title={hideAmounts ? "Tampilkan nilai" : "Sensor nilai"}>
                {hideAmounts ? <EyeOff size={16} /> : <Eye size={16} />}
              </IconBtn>
              <IconBtn onClick={() => setShowRecordModal(true)} title="Record bulanan/tahunan">
                <History size={16} />
              </IconBtn>
              <IconBtn onClick={() => setShowStokModal(true)} title="Stok pupuk">
                <Package size={16} />
              </IconBtn>
              <IconBtn onClick={() => setShowCatModal(true)} title="Kelola kategori">
                <Settings2 size={16} />
              </IconBtn>
              <IconBtn onClick={onLogout} title="Keluar akun">
                <LogOut size={16} />
              </IconBtn>
            </div>
          </div>

          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(201,154,46,0.15)",
            padding: "6px 12px", borderRadius: 20, marginBottom: 14,
          }}>
            <PiggyBank size={14} color={GOLD} />
            <span style={{ fontSize: 12, opacity: 0.85 }}>Saldo Kas</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13.5, fontWeight: 700, color: GOLD }}>
              <Amt>{rupiah(saldoKas)}</Amt>
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, opacity: 0.7 }}>
              {selectedLahan === "all" ? `Selisih Global — ${CURRENT_YEAR}` : `Selisih ${lahanMap[selectedLahan]?.name || ""} — ${CURRENT_YEAR}`}
            </span>
          </div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 34, fontWeight: 700,
            color: totals.net >= 0 ? "#BFE3A0" : "#F0B7A4",
          }}>
            <Amt>{totals.net >= 0 ? "" : "-"}{rupiah(Math.abs(totals.net))}</Amt>
          </div>

          {txError && (
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, color: "#F0B7A4", fontSize: 13 }}>
              <AlertCircle size={14} /> {txError}
            </div>
          )}

          {/* Petak / lahan selector */}
          <div style={{ display: "flex", gap: 10, overflowX: "auto", marginTop: 20, paddingBottom: 4 }}>
            <PetakTile
              label="Semua Lahan"
              isGlobal
              active={selectedLahan === "all"}
              onClick={() => setSelectedLahan("all")}
            />
            {lahanList.map((l) => (
              <PetakTile
                key={l.id}
                label={l.name}
                net={netForLahan(l.id)}
                active={selectedLahan === l.id}
                onClick={() => setSelectedLahan(l.id)}
              />
            ))}
            <button
              onClick={() => setShowLahanModal(true)}
              style={{
                minWidth: 60, height: 78, borderRadius: 14, border: "1.5px dashed rgba(246,243,231,0.35)",
                background: "transparent", color: "rgba(246,243,231,0.7)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}
              title="Kelola lahan"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "22px 20px 100px" }}>
        {lahanList.length === 0 && (
          <div style={{
            background: CARD, borderRadius: 16, padding: 28, textAlign: "center",
            border: "1px dashed rgba(31,46,29,0.2)", marginBottom: 20,
          }}>
            <Sprout size={26} color={GREEN} style={{ marginBottom: 8 }} />
            <p style={{ margin: "0 0 14px", color: "#5A5A4A" }}>Belum ada lahan. Tambahkan lahan pertama untuk mulai mencatat.</p>
            <PrimaryBtn onClick={() => setShowLahanModal(true)} style={{ margin: "0 auto" }}>
              <Plus size={16} /> Tambah Lahan
            </PrimaryBtn>
          </div>
        )}

        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 8 }}>
          <SummaryCard icon={<TrendingUp size={16} color={GREEN} />} label="Pemasukan" value={totals.income} color={GREEN}
            onAdd={lahanList.length > 0 ? () => { setTxPreset("income"); setEditingTx(null); setShowTxModal(true); } : null} />
          <SummaryCard icon={<TrendingDown size={16} color={RUST} />} label={isGlobalView ? "Pengeluaran (Kas)" : "Pengeluaran (Biaya)"} value={totals.expense} color={RUST}
            onAdd={lahanList.length > 0 ? () => { setTxPreset("expense"); setEditingTx(null); setShowTxModal(true); } : null} />
          <SummaryCard icon={<Wallet size={16} color={GOLD} />} label="Selisih" value={totals.net} color={totals.net >= 0 ? GREEN : RUST} />
        </div>
        {isGlobalView && stokPupuk.length > 0 && (
          <p style={{ fontSize: 12, color: "#8A8A78", margin: "0 0 18px" }}>
            *Kas keluar tidak menghitung dobel nilai pupuk yang dipakai di lahan — pupuk itu sudah dibayar saat dibeli.
          </p>
        )}
        {!isGlobalView && (
          <p style={{ fontSize: 12, color: "#8A8A78", margin: "0 0 18px" }}>
            *Biaya sudah termasuk nilai pupuk yang dipakai dari stok, meski uangnya keluar duluan saat pembelian.
          </p>
        )}

        {/* Charts */}
        {chartData.length > 0 && (
          <div style={{ background: CARD, borderRadius: 16, padding: "18px 16px", marginBottom: 20, border: "1px solid rgba(31,46,29,0.08)" }}>
            <h3 style={{ margin: "0 0 14px", fontFamily: "'Fraunces', serif", fontSize: 16, color: FOREST }}>
              Pengeluaran per Kategori
            </h3>
            <ResponsiveContainer key={`pie-${selectedLahan}`} width="100%" height={220}>
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={chartData.length > 1 ? 2 : 0} isAnimationActive={false}>
                  {chartData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />)}
                </Pie>
                <Tooltip formatter={(v) => rupiah(v)} contentStyle={{ fontFamily: "'Public Sans', sans-serif", borderRadius: 8, border: "1px solid rgba(31,46,29,0.15)" }} />
                <Legend iconType="circle" layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {selectedLahan === "all" && lahanCompareData.length > 1 && (
          <div style={{ background: CARD, borderRadius: 16, padding: "18px 16px", marginBottom: 20, border: "1px solid rgba(31,46,29,0.08)" }}>
            <h3 style={{ margin: "0 0 14px", fontFamily: "'Fraunces', serif", fontSize: 16, color: FOREST }}>
              Perbandingan Antar Lahan
            </h3>
            <ResponsiveContainer key="bar-compare" width="100%" height={220}>
              <BarChart data={lahanCompareData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(31,46,29,0.1)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v >= 1000000 ? `${v / 1000000}jt` : v)} />
                <Tooltip formatter={(v) => rupiah(v)} contentStyle={{ fontFamily: "'Public Sans', sans-serif", borderRadius: 8, border: "1px solid rgba(31,46,29,0.15)" }} />
                <Legend iconType="circle" layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Pemasukan" fill={GREEN} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="Pengeluaran" fill={RUST} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Transaction list */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontFamily: "'Fraunces', serif", fontSize: 17, color: FOREST }}>
            Riwayat Transaksi
          </h3>
          <span style={{ fontSize: 12.5, color: "#7A7A68" }}>{filteredTx.length} catatan</span>
        </div>

        {filteredTx.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#8A8A78", fontSize: 14 }}>
            Belum ada transaksi{selectedLahan !== "all" ? " di lahan ini" : ""}.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filteredTx.map((t) => (
              <div key={t.id} style={{
                background: "#fff", borderRadius: 12, padding: "12px 14px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                border: "1px solid rgba(31,46,29,0.08)",
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {catMap[t.categoryId]?.name || "Lainnya"}
                    {selectedLahan === "all" && (
                      <span style={{
                        fontSize: 10.5, background: "#EFEAD9", color: "#5A5A4A",
                        padding: "2px 7px", borderRadius: 20, fontWeight: 600,
                      }}>
                        {lahanMap[t.lahanId]?.name || "?"}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: "#8A8A78", marginTop: 2 }}>
                    {t.date}
                    {t.kind === "pupuk_usage" && ` · ${t.kg}kg ${t.pupukNama} → Pupuk ${rupiah(t.pupukCost)} + Kerja ${rupiah(t.laborCost)}`}
                    {t.kind === "pupuk_purchase" && ` · +${t.kg}kg ${t.pupukNama} ke stok`}
                    {!t.kind && t.note ? ` · ${t.note}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 14.5,
                    color: t.type === "income" ? GREEN : RUST, whiteSpace: "nowrap",
                  }}>
                    {t.type === "income" ? "+" : "-"}<Amt>{rupiah(t.amount)}</Amt>
                  </span>
                  <IconBtn onClick={() => openEditFor(t)} title="Edit"><Pencil size={14} /></IconBtn>
                  <IconBtn onClick={() => requestDeleteTx(t.id)} title="Hapus" danger><Trash2 size={14} /></IconBtn>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* FAB menu */}
      {lahanList.length > 0 && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 20, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
          {showFabMenu && (
            <>
              <FabOption label="Pemupukan (pakai stok)" icon={<Hammer size={15} />} onClick={() => { setShowFabMenu(false); setEditingTx(null); setShowPemupukanModal(true); }} disabled={stokPupuk.length === 0} />
              <FabOption label="Beli Pupuk (Stok)" icon={<ShoppingBag size={15} />} onClick={() => { setShowFabMenu(false); setEditingTx(null); setShowBeliModal(true); }} />
              <FabOption label="Input Saldo (Modal)" icon={<PiggyBank size={15} />} onClick={() => { setShowFabMenu(false); setEditingTx(null); setShowSaldoModal(true); }} />
              <FabOption label="Transaksi Manual" icon={<Plus size={15} />} onClick={() => { setShowFabMenu(false); setEditingTx(null); setTxPreset(null); setShowTxModal(true); }} />
            </>
          )}
          <button
            onClick={() => setShowFabMenu((v) => !v)}
            style={{
              width: 56, height: 56, borderRadius: 28,
              background: GOLD, color: FOREST, border: "none", cursor: "pointer",
              boxShadow: "0 8px 20px rgba(201,154,46,0.45)", display: "flex",
              alignItems: "center", justifyContent: "center",
              transform: showFabMenu ? "rotate(45deg)" : "rotate(0deg)",
              transition: "transform .15s ease",
            }}
            title="Tambah"
          >
            <Plus size={26} />
          </button>
        </div>
      )}

      {showTxModal && (
        <TxModal
          onClose={() => { setShowTxModal(false); setEditingTx(null); setTxPreset(null); }}
          onSave={saveTx}
          lahanList={lahanList}
          categories={categories}
          initial={editingTx}
          presetType={txPreset}
          defaultLahan={selectedLahan !== "all" ? selectedLahan : (lahanList[0]?.id || "")}
        />
      )}

      {showLahanModal && (
        <LahanModal
          onClose={() => setShowLahanModal(false)}
          lahanList={lahanList}
          onSave={saveLahan}
          onDelete={deleteLahan}
        />
      )}

      {showCatModal && (
        <CategoryModal
          onClose={() => setShowCatModal(false)}
          categories={categories}
          onSave={saveCategory}
          onDelete={deleteCategory}
        />
      )}

      {showStokModal && (
        <StokModal onClose={() => setShowStokModal(false)} stokPupuk={stokPupuk} onAddJenis={addPupukJenis} />
      )}

      {showBeliModal && (
        <BeliPupukModal
          onClose={() => { setShowBeliModal(false); setEditingTx(null); }}
          stokPupuk={stokPupuk}
          onSave={purchasePupuk}
          initial={editingTx && editingTx.kind === "pupuk_purchase" ? editingTx : null}
        />
      )}

      {showPemupukanModal && (
        <PemupukanModal
          onClose={() => { setShowPemupukanModal(false); setEditingTx(null); }}
          stokPupuk={stokPupuk}
          lahanList={lahanList}
          onSave={usePupuk}
          defaultLahan={selectedLahan !== "all" ? selectedLahan : (lahanList[0]?.id || "")}
          initial={editingTx && editingTx.kind === "pupuk_usage" ? editingTx : null}
        />
      )}

      {showSaldoModal && (
        <SaldoModal
          onClose={() => { setShowSaldoModal(false); setEditingTx(null); }}
          onSave={inputSaldo}
          initial={editingTx && editingTx.kind === "saldo_input" ? editingTx : null}
        />
      )}

      {confirmDeleteId && (
        <ConfirmModal
          title="Hapus Transaksi?"
          message="Catatan ini akan dihapus permanen dan tidak bisa dikembalikan. Kalau ini transaksi pupuk, stok akan disesuaikan otomatis."
          onConfirm={confirmDelete}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      {showRecordModal && (
        <RecordModal
          onClose={() => setShowRecordModal(false)}
          transactions={transactions}
          lahanList={lahanList}
          catMap={catMap}
        />
      )}
    </div>
    </BlurContext.Provider>
  );
}

function FabOption({ label, icon, onClick, disabled }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "9px 14px",
        borderRadius: 20, border: "1px solid rgba(31,46,29,0.12)",
        background: disabled ? "#EFEAD9" : "#FBF9F1", color: disabled ? "#B0AC9A" : FOREST,
        fontSize: 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: "0 4px 12px rgba(31,46,29,0.18)", whiteSpace: "nowrap",
      }}
      title={disabled ? "Belum ada stok pupuk" : undefined}
    >
      {icon} {label}
    </button>
  );
}

function SummaryCard({ icon, label, value, color, onAdd }) {
  return (
    <div style={{ background: CARD, borderRadius: 14, padding: "14px 16px", border: "1px solid rgba(31,46,29,0.08)", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {icon}
          <span style={{ fontSize: 12, fontWeight: 600, color: "#5A5A4A", textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</span>
        </div>
        {onAdd && (
          <button onClick={onAdd} title="Tambah transaksi" style={{
            width: 22, height: 22, borderRadius: 7, border: "none", background: "rgba(31,46,29,0.08)",
            color: FOREST, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Plus size={13} />
          </button>
        )}
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color }}>
        <Amt>{rupiah(value)}</Amt>
      </div>
    </div>
  );
}

function TxModal({ onClose, onSave, lahanList, categories, initial, defaultLahan, presetType }) {
  const [type, setType] = useState(initial?.type || presetType || "expense");
  const [lahanId, setLahanId] = useState(initial?.lahanId || defaultLahan);
  const [categoryId, setCategoryId] = useState(initial?.categoryId || "");
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : "");
  const [date, setDate] = useState(initial?.date || todayStr());
  const [note, setNote] = useState(initial?.note || "");

  const availableCats = categories.filter((c) => c.type === type && !c.locked);

  useEffect(() => {
    if (!availableCats.find((c) => c.id === categoryId)) {
      setCategoryId(availableCats[0]?.id || "");
    }
    // eslint-disable-next-line
  }, [type]);

  function submit() {
    const amt = parseFloat(amount);
    if (!lahanId || !categoryId || !amt || amt <= 0 || !date) return;
    onSave({ id: initial?.id, type, lahanId, categoryId, amount: amt, date, note: note.trim() });
  }

  return (
    <Modal title={initial ? "Edit Transaksi" : "Tambah Transaksi"} onClose={onClose}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["expense", "income"].map((tp) => (
          <button
            key={tp}
            onClick={() => setType(tp)}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer",
              border: type === tp ? `2px solid ${tp === "income" ? GREEN : RUST}` : "1px solid rgba(31,46,29,0.15)",
              background: type === tp ? (tp === "income" ? "#EAF3E1" : "#F7E6E0") : "#fff",
              color: type === tp ? (tp === "income" ? GREEN : RUST) : "#5A5A4A",
              fontWeight: 700, fontSize: 14,
            }}
          >
            {tp === "income" ? "Pemasukan" : "Pengeluaran"}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Lahan</FieldLabel>
        <select style={inputStyle} value={lahanId} onChange={(e) => setLahanId(e.target.value)}>
          {lahanList.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Kategori</FieldLabel>
        <select style={inputStyle} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {availableCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Jumlah (Rp)</FieldLabel>
        <input style={inputStyle} type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
      </div>

      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Tanggal</FieldLabel>
        <input style={inputStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <FieldLabel>Catatan (opsional)</FieldLabel>
        <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. beli 2 sak pupuk NPK" />
      </div>

      <PrimaryBtn onClick={submit} style={{ width: "100%", justifyContent: "center" }}>
        {initial ? "Simpan Perubahan" : "Simpan Transaksi"}
      </PrimaryBtn>
    </Modal>
  );
}

function LahanModal({ onClose, lahanList, onSave, onDelete }) {
  const [editing, setEditing] = useState(null); // {id?, name, luas}
  const [name, setName] = useState("");
  const [luas, setLuas] = useState("");

  function startEdit(l) {
    setEditing(l || {});
    setName(l?.name || "");
    setLuas(l?.luas || "");
  }

  async function submit() {
    if (!name.trim()) return;
    await onSave({ id: editing?.id, name: name.trim(), luas: luas.trim() });
    setEditing(null);
    setName("");
    setLuas("");
  }

  return (
    <Modal title="Kelola Lahan" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {lahanList.length === 0 && <p style={{ color: "#8A8A78", fontSize: 13.5, margin: 0 }}>Belum ada lahan.</p>}
        {lahanList.map((l) => (
          <div key={l.id} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "#fff", borderRadius: 10, padding: "10px 12px", border: "1px solid rgba(31,46,29,0.08)",
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14.5 }}>{l.name}</div>
              {l.luas && <div style={{ fontSize: 12, color: "#8A8A78" }}>{l.luas}</div>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <IconBtn onClick={() => startEdit(l)} title="Edit"><Pencil size={14} /></IconBtn>
              <IconBtn onClick={() => onDelete(l.id)} title="Hapus (transaksi terkait ikut terhapus)" danger><Trash2 size={14} /></IconBtn>
            </div>
          </div>
        ))}
      </div>

      {editing ? (
        <div style={{ borderTop: "1px solid rgba(31,46,29,0.1)", paddingTop: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <FieldLabel>Nama Lahan</FieldLabel>
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Sawah Blok A" autoFocus />
          </div>
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>Luas (opsional)</FieldLabel>
            <input style={inputStyle} value={luas} onChange={(e) => setLuas(e.target.value)} placeholder="mis. 0.5 ha" />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <PrimaryBtn onClick={submit} style={{ flex: 1, justifyContent: "center" }}>Simpan</PrimaryBtn>
            <button onClick={() => setEditing(null)} style={{
              padding: "10px 16px", borderRadius: 12, border: "1px solid rgba(31,46,29,0.2)",
              background: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#5A5A4A",
            }}>Batal</button>
          </div>
        </div>
      ) : (
        <PrimaryBtn onClick={() => startEdit(null)} style={{ width: "100%", justifyContent: "center" }}>
          <Plus size={16} /> Tambah Lahan Baru
        </PrimaryBtn>
      )}
    </Modal>
  );
}

function CategoryModal({ onClose, categories, onSave, onDelete }) {
  const [tab, setTab] = useState("expense");
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");

  const list = categories.filter((c) => c.type === tab);

  function startEdit(c) {
    setEditing(c || {});
    setName(c?.name || "");
  }

  async function submit() {
    if (!name.trim()) return;
    await onSave({ id: editing?.id, name: name.trim(), type: editing?.type || tab });
    setEditing(null);
    setName("");
  }

  return (
    <Modal title="Kelola Kategori (Template)" onClose={onClose} wide>
      <p style={{ fontSize: 13, color: "#7A7A68", marginTop: -4, marginBottom: 14 }}>
        Ini template kategori pengeluaran/pemasukan. Tambah, ubah, atau hapus sesuai kebutuhan usahamu.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {["expense", "income"].map((tp) => (
          <button
            key={tp}
            onClick={() => setTab(tp)}
            style={{
              flex: 1, padding: "8px 0", borderRadius: 10, cursor: "pointer",
              border: tab === tp ? `2px solid ${FOREST}` : "1px solid rgba(31,46,29,0.15)",
              background: tab === tp ? "#EAF0E4" : "#fff", fontWeight: 700, fontSize: 13.5,
              color: tab === tp ? FOREST : "#5A5A4A",
            }}
          >
            {tp === "income" ? "Pemasukan" : "Pengeluaran"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16, maxHeight: 260, overflowY: "auto" }}>
        {list.map((c) => (
          <div key={c.id} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "#fff", borderRadius: 10, padding: "9px 12px", border: "1px solid rgba(31,46,29,0.08)",
          }}>
            <span style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
              {c.name}
              {c.locked && <span title="Dikelola otomatis lewat menu Beli Pupuk / Pemupukan / Input Saldo"><Lock size={11} color="#8A8A78" /></span>}
            </span>
            {!c.locked && (
              <div style={{ display: "flex", gap: 6 }}>
                <IconBtn onClick={() => startEdit(c)} title="Edit"><Pencil size={13} /></IconBtn>
                <IconBtn onClick={() => onDelete(c.id)} title="Hapus" danger><Trash2 size={13} /></IconBtn>
              </div>
            )}
          </div>
        ))}
        {list.length === 0 && <p style={{ color: "#8A8A78", fontSize: 13.5, margin: "6px 0" }}>Belum ada kategori {tab === "income" ? "pemasukan" : "pengeluaran"}.</p>}
      </div>

      {editing ? (
        <div style={{ borderTop: "1px solid rgba(31,46,29,0.1)", paddingTop: 14 }}>
          <div style={{ marginBottom: 12 }}>
            <FieldLabel>Nama Kategori</FieldLabel>
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Solar/BBM Traktor" autoFocus />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <PrimaryBtn onClick={submit} style={{ flex: 1, justifyContent: "center" }}>Simpan</PrimaryBtn>
            <button onClick={() => setEditing(null)} style={{
              padding: "10px 16px", borderRadius: 12, border: "1px solid rgba(31,46,29,0.2)",
              background: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#5A5A4A",
            }}>Batal</button>
          </div>
        </div>
      ) : (
        <PrimaryBtn onClick={() => startEdit(null)} style={{ width: "100%", justifyContent: "center" }}>
          <Plus size={16} /> Tambah Kategori {tab === "income" ? "Pemasukan" : "Pengeluaran"}
        </PrimaryBtn>
      )}
    </Modal>
  );
}

function StokModal({ onClose, stokPupuk, onAddJenis }) {
  const [newName, setNewName] = useState("");
  const totalNilai = stokPupuk.reduce((s, i) => s + i.stokKg * i.hargaPerKg, 0);

  async function submit() {
    if (!newName.trim()) return;
    await onAddJenis(newName);
    setNewName("");
  }

  return (
    <Modal title="Stok Pupuk" onClose={onClose}>
      <div style={{
        background: CARD, borderRadius: 12, padding: "12px 14px", marginBottom: 16,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#5A5A4A" }}>Total Nilai Stok</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: FOREST }}>{rupiah(totalNilai)}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {stokPupuk.length === 0 && (
          <p style={{ color: "#8A8A78", fontSize: 13.5, margin: 0 }}>
            Belum ada jenis pupuk. Tambahkan lewat form di bawah, atau langsung lewat "Beli Pupuk".
          </p>
        )}
        {stokPupuk.map((s) => (
          <div key={s.id} style={{
            background: "#fff", borderRadius: 10, padding: "10px 12px", border: "1px solid rgba(31,46,29,0.08)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{s.nama}</div>
              <div style={{ fontSize: 12, color: "#8A8A78" }}>
                {s.hargaPerKg > 0 ? `Rata-rata ${rupiah(s.hargaPerKg)}/kg` : "Belum ada harga"}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 14.5, color: s.stokKg > 0 ? GREEN : "#B0AC9A" }}>
                {s.stokKg} kg
              </div>
              <div style={{ fontSize: 11.5, color: "#8A8A78" }}>{rupiah(s.stokKg * s.hargaPerKg)}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px solid rgba(31,46,29,0.1)", paddingTop: 14 }}>
        <FieldLabel>Tambah Jenis Pupuk Baru</FieldLabel>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={inputStyle} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="mis. NPK Mutiara" />
          <PrimaryBtn onClick={submit}><Plus size={16} /></PrimaryBtn>
        </div>
      </div>
    </Modal>
  );
}

function BeliPupukModal({ onClose, stokPupuk, onSave, initial }) {
  const [pupukId, setPupukId] = useState(initial?.pupukId || stokPupuk[0]?.id || "");
  const [addingNew, setAddingNew] = useState(!initial && stokPupuk.length === 0);
  const [newName, setNewName] = useState("");
  const [kg, setKg] = useState(initial?.kg ? String(initial.kg) : "");
  const [totalHarga, setTotalHarga] = useState(initial?.amount ? String(initial.amount) : "");
  const [date, setDate] = useState(initial?.date || todayStr());
  const [note, setNote] = useState(initial?.note || "");

  const kgNum = parseFloat(kg) || 0;
  const hargaNum = parseFloat(totalHarga) || 0;
  const hargaPerKg = kgNum > 0 ? hargaNum / kgNum : 0;

  function submit() {
    if (addingNew && !newName.trim()) return;
    if (!addingNew && !pupukId) return;
    if (kgNum <= 0 || hargaNum <= 0) return;
    onSave({
      id: initial?.id,
      pupukId: addingNew ? null : pupukId,
      newPupukName: addingNew ? newName : null,
      kg: kgNum, totalHarga: hargaNum, date, note,
    });
  }

  return (
    <Modal title={initial ? "Edit Pembelian Pupuk" : "Beli Pupuk (Tambah Stok)"} onClose={onClose}>
      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Jenis Pupuk</FieldLabel>
        {!addingNew ? (
          <>
            <select style={inputStyle} value={pupukId} onChange={(e) => setPupukId(e.target.value)}>
              {stokPupuk.map((s) => <option key={s.id} value={s.id}>{s.nama}</option>)}
            </select>
            <button onClick={() => setAddingNew(true)} style={{
              marginTop: 6, background: "none", border: "none", color: GREEN, fontSize: 12.5,
              fontWeight: 600, cursor: "pointer", padding: 0,
            }}>+ Tambah jenis baru</button>
          </>
        ) : (
          <>
            <input style={inputStyle} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="mis. Urea" autoFocus />
            {stokPupuk.length > 0 && (
              <button onClick={() => setAddingNew(false)} style={{
                marginTop: 6, background: "none", border: "none", color: "#5A5A4A", fontSize: 12.5,
                fontWeight: 600, cursor: "pointer", padding: 0,
              }}>Pilih dari yang sudah ada</button>
            )}
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <FieldLabel>Jumlah (kg)</FieldLabel>
          <input style={inputStyle} type="number" min="0" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="0" />
        </div>
        <div style={{ flex: 1 }}>
          <FieldLabel>Total Harga (Rp)</FieldLabel>
          <input style={inputStyle} type="number" min="0" value={totalHarga} onChange={(e) => setTotalHarga(e.target.value)} placeholder="0" />
        </div>
      </div>

      {kgNum > 0 && hargaNum > 0 && (
        <p style={{ fontSize: 12.5, color: "#5A5A4A", marginTop: -6, marginBottom: 14 }}>
          ≈ {rupiah(hargaPerKg)} / kg
        </p>
      )}

      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Tanggal</FieldLabel>
        <input style={inputStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <FieldLabel>Catatan (opsional)</FieldLabel>
        <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. beli di toko tani Pak Slamet" />
      </div>

      <p style={{ fontSize: 12, color: "#8A8A78", marginTop: -8, marginBottom: 14 }}>
        Transaksi ini masuk sebagai pengeluaran kas global (tidak terikat ke lahan tertentu) dan menambah stok.
      </p>

      <PrimaryBtn onClick={submit} style={{ width: "100%", justifyContent: "center" }}>Simpan Pembelian</PrimaryBtn>
    </Modal>
  );
}

function PemupukanModal({ onClose, stokPupuk, lahanList, onSave, defaultLahan, initial }) {
  const [lahanId, setLahanId] = useState(initial?.lahanId || defaultLahan);
  const [pupukId, setPupukId] = useState(initial?.pupukId || stokPupuk[0]?.id || "");
  const [kg, setKg] = useState(initial?.kg ? String(initial.kg) : "");
  const [laborCost, setLaborCost] = useState(initial?.laborCost ? String(initial.laborCost) : "");
  const [date, setDate] = useState(initial?.date || todayStr());
  const [note, setNote] = useState(initial?.note || "");

  const item = stokPupuk.find((s) => s.id === pupukId);
  const kgNum = parseFloat(kg) || 0;
  const laborNum = parseFloat(laborCost) || 0;
  const pupukCost = item ? kgNum * item.hargaPerKg : 0;
  // saat edit, kg yang sudah dipakai transaksi ini dianggap "kembali" dulu ke stok
  const stokTersedia = item ? item.stokKg + (initial && initial.pupukId === pupukId ? initial.kg : 0) : 0;
  const overStock = item && kgNum > stokTersedia;

  function submit() {
    if (!lahanId || !pupukId || kgNum <= 0 || overStock) return;
    onSave({ id: initial?.id, lahanId, pupukId, kg: kgNum, laborCost: laborNum, date, note });
  }

  return (
    <Modal title={initial ? "Edit Pemupukan" : "Catat Pemupukan"} onClose={onClose}>
      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Lahan</FieldLabel>
        <select style={inputStyle} value={lahanId} onChange={(e) => setLahanId(e.target.value)}>
          {lahanList.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Jenis Pupuk</FieldLabel>
        <select style={inputStyle} value={pupukId} onChange={(e) => setPupukId(e.target.value)}>
          {stokPupuk.map((s) => <option key={s.id} value={s.id}>{s.nama} (stok {s.id === initial?.pupukId ? s.stokKg + initial.kg : s.stokKg}kg)</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 6 }}>
        <FieldLabel>Jumlah Dipakai (kg)</FieldLabel>
        <input style={inputStyle} type="number" min="0" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="0" />
      </div>
      {item && (
        <p style={{ fontSize: 12.5, margin: "0 0 14px", color: overStock ? RUST : "#8A8A78" }}>
          {overStock ? `Stok tidak cukup (tersisa ${stokTersedia}kg)` : `≈ ${rupiah(pupukCost)} (dari stok, bukan kas baru)`}
        </p>
      )}

      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Biaya Kerja Pemupukan (Rp, opsional)</FieldLabel>
        <input style={inputStyle} type="number" min="0" value={laborCost} onChange={(e) => setLaborCost(e.target.value)} placeholder="0" />
      </div>

      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Tanggal</FieldLabel>
        <input style={inputStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <FieldLabel>Catatan (opsional)</FieldLabel>
        <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. pemupukan susulan ke-2" />
      </div>

      <div style={{
        background: CARD, borderRadius: 10, padding: "10px 12px", marginBottom: 16,
        display: "flex", justifyContent: "space-between", fontSize: 13.5,
      }}>
        <span style={{ color: "#5A5A4A" }}>Total biaya lahan ini</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: FOREST }}>
          {rupiah(pupukCost + laborNum)}
        </span>
      </div>

      <PrimaryBtn onClick={submit} style={{ width: "100%", justifyContent: "center" }}>Simpan</PrimaryBtn>
    </Modal>
  );
}

function SaldoModal({ onClose, onSave, initial }) {
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : "");
  const [date, setDate] = useState(initial?.date || todayStr());
  const [note, setNote] = useState(initial?.note || "");

  function submit() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0 || !date) return;
    onSave({ id: initial?.id, amount: amt, date, note });
  }

  return (
    <Modal title={initial ? "Edit Input Saldo" : "Input Saldo (Modal)"} onClose={onClose}>
      <p style={{ fontSize: 12.5, color: "#8A8A78", marginTop: -6, marginBottom: 16 }}>
        Buat catat suntikan modal/dana awal usaha. Ini nambah Saldo Kas tapi terpisah dari Pemasukan (hasil usaha).
      </p>

      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Jumlah (Rp)</FieldLabel>
        <input style={inputStyle} type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus />
      </div>

      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Tanggal</FieldLabel>
        <input style={inputStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <FieldLabel>Catatan (opsional)</FieldLabel>
        <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. modal awal usaha" />
      </div>

      <PrimaryBtn onClick={submit} style={{ width: "100%", justifyContent: "center" }}>Simpan Saldo</PrimaryBtn>
    </Modal>
  );
}

function RecordModal({ onClose, transactions, lahanList, catMap }) {
  const [tab, setTab] = useState("bulanan"); // 'bulanan' | 'tahunan'
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [drillLahan, setDrillLahan] = useState(null);

  const availableYears = useMemo(() => {
    const set = new Set([CURRENT_YEAR]);
    transactions.forEach((t) => { const y = txYear(t); if (y) set.add(y); });
    return Array.from(set).sort((a, b) => b - a);
  }, [transactions]);

  const periodTx = useMemo(() => {
    return transactions.filter((t) => {
      if (!t.date) return false;
      const y = txYear(t);
      if (y !== year) return false;
      if (tab === "bulanan") {
        const m = parseInt(t.date.slice(5, 7), 10);
        if (m !== month) return false;
      }
      return true;
    }).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [transactions, tab, year, month]);

  const recap = useMemo(() => {
    let pemasukan = 0, pengeluaranKas = 0, inputSaldo = 0;
    periodTx.forEach((t) => {
      if (t.type === "income") {
        if (t.categoryId === CAT_SALDO) inputSaldo += t.amount; else pemasukan += t.amount;
      } else {
        pengeluaranKas += (t.cashAmount !== undefined ? t.cashAmount : t.amount);
      }
    });
    return { pemasukan, pengeluaranKas, inputSaldo, net: pemasukan - pengeluaranKas };
  }, [periodTx]);

  const perLahan = useMemo(() => {
    return lahanList.map((l) => {
      const tx = periodTx.filter((t) => t.lahanId === l.id);
      const income = tx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
      const expense = tx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
      return { lahan: l, income, expense, net: income - expense, count: tx.length };
    });
  }, [periodTx, lahanList]);

  const drillTx = drillLahan ? periodTx.filter((t) => t.lahanId === drillLahan) : [];
  const drillLahanObj = lahanList.find((l) => l.id === drillLahan);

  return (
    <Modal title={drillLahan ? drillLahanObj?.name : "Record Bulanan & Tahunan"} onClose={onClose} wide>
      {drillLahan ? (
        <div>
          <button onClick={() => setDrillLahan(null)} style={{
            display: "flex", alignItems: "center", gap: 4, background: "none", border: "none",
            color: GREEN, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 14,
          }}>
            <ChevronLeft size={15} /> Kembali ke rekap
          </button>
          <p style={{ fontSize: 12.5, color: "#8A8A78", marginTop: -6, marginBottom: 14 }}>
            {tab === "bulanan" ? `${MONTH_NAMES[month - 1]} ${year}` : `Tahun ${year}`}
          </p>
          {drillTx.length === 0 ? (
            <p style={{ color: "#8A8A78", fontSize: 13.5 }}>Tidak ada transaksi pada periode ini.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {drillTx.map((t) => (
                <div key={t.id} style={{
                  background: "#fff", borderRadius: 10, padding: "10px 12px", border: "1px solid rgba(31,46,29,0.08)",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{catMap[t.categoryId]?.name || "Lainnya"}</div>
                    <div style={{ fontSize: 11.5, color: "#8A8A78" }}>
                      {t.date}
                      {t.kind === "pupuk_usage" && ` · ${t.kg}kg ${t.pupukNama}`}
                      {!t.kind && t.note ? ` · ${t.note}` : ""}
                    </div>
                  </div>
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13.5,
                    color: t.type === "income" ? GREEN : RUST,
                  }}>
                    {t.type === "income" ? "+" : "-"}<Amt>{rupiah(t.amount)}</Amt>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {["bulanan", "tahunan"].map((tp) => (
              <button
                key={tp}
                onClick={() => setTab(tp)}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 10, cursor: "pointer",
                  border: tab === tp ? `2px solid ${FOREST}` : "1px solid rgba(31,46,29,0.15)",
                  background: tab === tp ? "#EAF0E4" : "#fff", fontWeight: 700, fontSize: 13.5,
                  color: tab === tp ? FOREST : "#5A5A4A",
                }}
              >
                {tp === "bulanan" ? "Bulanan" : "Tahunan"}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {tab === "bulanan" && (
              <select style={{ ...inputStyle, flex: 1 }} value={month} onChange={(e) => setMonth(parseInt(e.target.value, 10))}>
                {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            )}
            <select style={{ ...inputStyle, flex: 1 }} value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))}>
              {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 14 }}>
            <div style={{ background: CARD, borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "#5A5A4A", fontWeight: 600, textTransform: "uppercase" }}>Pemasukan</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: GREEN, fontSize: 15 }}><Amt>{rupiah(recap.pemasukan)}</Amt></div>
            </div>
            <div style={{ background: CARD, borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "#5A5A4A", fontWeight: 600, textTransform: "uppercase" }}>Pengeluaran (Kas)</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: RUST, fontSize: 15 }}><Amt>{rupiah(recap.pengeluaranKas)}</Amt></div>
            </div>
            <div style={{ background: CARD, borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "#5A5A4A", fontWeight: 600, textTransform: "uppercase" }}>Net Operasional</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: recap.net >= 0 ? GREEN : RUST, fontSize: 15 }}><Amt>{rupiah(recap.net)}</Amt></div>
            </div>
          </div>
          {recap.inputSaldo > 0 && (
            <p style={{ fontSize: 12, color: "#8A8A78", margin: "0 0 16px" }}>
              + Input Saldo periode ini: <Amt>{rupiah(recap.inputSaldo)}</Amt> (di luar Pemasukan di atas)
            </p>
          )}

          <h4 style={{ margin: "0 0 10px", fontFamily: "'Fraunces', serif", fontSize: 15, color: FOREST }}>Per Lahan</h4>
          {perLahan.length === 0 ? (
            <p style={{ color: "#8A8A78", fontSize: 13.5 }}>Belum ada lahan.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {perLahan.map((row) => (
                <button
                  key={row.lahan.id}
                  onClick={() => setDrillLahan(row.lahan.id)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: "#fff", borderRadius: 10, padding: "10px 12px", border: "1px solid rgba(31,46,29,0.08)",
                    cursor: "pointer", textAlign: "left", width: "100%",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{row.lahan.name}</div>
                    <div style={{ fontSize: 11.5, color: "#8A8A78" }}>{row.count} catatan</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13.5,
                      color: row.net >= 0 ? GREEN : RUST,
                    }}>
                      {row.net >= 0 ? "+" : ""}<Amt>{rupiah(row.net)}</Amt>
                    </span>
                    <ChevronRight size={15} color="#8A8A78" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ---------- Root: kelola sesi login ----------

export default function App() {
  const [username, setUsername] = useState(() => {
    try { return localStorage.getItem(LS_SESSION_KEY) || null; } catch (e) { return null; }
  });

  function handleLogin(u) {
    try { localStorage.setItem(LS_SESSION_KEY, u); } catch (e) {}
    setUsername(u);
  }

  function handleLogout() {
    try { localStorage.removeItem(LS_SESSION_KEY); } catch (e) {}
    setUsername(null);
  }

  if (!username) {
    return <LoginScreen onLogin={handleLogin} />;
  }
  return <Dashboard username={username} onLogout={handleLogout} />;
}
