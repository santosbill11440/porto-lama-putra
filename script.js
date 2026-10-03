import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
    sendEmailVerification, sendPasswordResetEmail, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore, doc, setDoc, getDoc, getDocs, addDoc, collection,
    query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ===== 1. ISI CONFIG FIREBASE LO DI SINI ===== */
const firebaseConfig = {
    apiKey: "ISI_API_KEY",
    authDomain: "ISI.firebaseapp.com",
    projectId: "ISI",
    appId: "ISI"
};

const cloudReady = !firebaseConfig.apiKey.startsWith("ISI");
let auth, db;
if (cloudReady) {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
}

const $ = id => document.getElementById(id);
let currentUser = null;
const canUseCloud = () => cloudReady && currentUser && currentUser.emailVerified;

/* ===== 2. MENU DRAWER, OVERLAY, MODAL, HALAMAN ===== */
const drawer = $("drawer"), overlay = $("overlay");
const pages = document.querySelectorAll(".page");
const navItems = document.querySelectorAll(".nav-item");

function closeAll() {
    drawer.classList.remove("open");
    document.querySelectorAll(".modal").forEach(m => m.classList.remove("show"));
    overlay.classList.remove("show");
}
function openDrawer() { drawer.classList.add("open"); overlay.classList.add("show"); }
function openModal(id) {
    closeAll();
    $(id).classList.add("show");
    overlay.classList.add("show");
}
function showPage(id) {
    pages.forEach(p => p.classList.toggle("active", p.id === id));
    navItems.forEach(n => n.classList.toggle("active", n.dataset.page === id));
    closeAll();
    if (id === "rating") loadRatingSummary();
}

$("menuBtn").onclick = openDrawer;
$("closeBtn").onclick = closeAll;
overlay.onclick = closeAll;
document.querySelectorAll("[data-close]").forEach(b => b.onclick = closeAll);
document.addEventListener("keydown", e => { if (e.key === "Escape") closeAll(); });
navItems.forEach(n => n.onclick = () => showPage(n.dataset.page));
document.querySelectorAll("[data-goto]").forEach(b => b.onclick = () => showPage(b.dataset.goto));

$("authBtn").onclick = () => { renderAuth(); openModal("authModal"); };
$("reportBtn").onclick = () => { openModal("reportModal"); loadReports(); };

/* ===== 3. LOGIN + VERIFIKASI EMAIL (opsional) ===== */
function authMsg(t) { $("authMsg").textContent = t; }

function friendlyError(e) {
    const map = {
        "auth/email-already-in-use": "Email sudah terdaftar, coba Masuk.",
        "auth/invalid-email": "Format email tidak valid.",
        "auth/weak-password": "Password minimal 6 karakter.",
        "auth/invalid-credential": "Email atau password salah.",
        "auth/too-many-requests": "Terlalu banyak percobaan, tunggu sebentar."
    };
    return map[e.code] || "Terjadi kesalahan: " + e.code;
}

function renderAuth() {
    authMsg("");
    if (!cloudReady) {
        $("authForm").hidden = false; $("authAccount").hidden = true;
        authMsg("Firebase belum dikonfigurasi. Isi firebaseConfig di script.js dulu.");
        return;
    }
    $("authForm").hidden = !!currentUser;
    $("authAccount").hidden = !currentUser;
    if (currentUser) {
        $("accEmail").textContent = currentUser.email;
        $("accStatus").textContent = currentUser.emailVerified
            ? "✅ Email terverifikasi"
            : "⚠️ Belum terverifikasi. Cek inbox/spam lo lalu klik link verifikasi.";
    }
    $("authBtn").textContent = currentUser ? "Akun" : "Masuk";
}

$("registerBtn").onclick = async () => {
    if (!cloudReady) return renderAuth();
    try {
        const cred = await createUserWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
        await sendEmailVerification(cred.user);
        authMsg("Akun dibuat. Link verifikasi sudah dikirim ke email lo.");
    } catch (e) { authMsg(friendlyError(e)); }
};
$("loginBtn").onclick = async () => {
    if (!cloudReady) return renderAuth();
    try {
        await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
        authMsg("");
    } catch (e) { authMsg(friendlyError(e)); }
};
$("resetBtn").onclick = async () => {
    if (!cloudReady) return renderAuth();
    try {
        await sendPasswordResetEmail(auth, $("email").value.trim());
        authMsg("Link reset password dikirim ke email lo.");
    } catch (e) { authMsg(friendlyError(e)); }
};
$("resendBtn").onclick = async () => {
    try { await sendEmailVerification(currentUser); authMsg("Email verifikasi dikirim ulang."); }
    catch (e) { authMsg(friendlyError(e)); }
};
$("checkBtn").onclick = async () => {
    await currentUser.reload();
    currentUser = auth.currentUser;
    renderAuth();
    authMsg(currentUser.emailVerified ? "Verifikasi berhasil!" : "Belum terverifikasi.");
    loadUserRating(); loadReports();
};
$("logoutBtn").onclick = () => signOut(auth);

if (cloudReady) {
    onAuthStateChanged(auth, user => {
        currentUser = user;
        renderAuth();
        loadUserRating(); loadReports(); loadRatingSummary();
    });
}

/* ===== 4. RATING 1-5 (tersimpan per user) ===== */
let selected = 0;
const starBtns = document.querySelectorAll("#stars button");

function paintStars() {
    starBtns.forEach(b => b.classList.toggle("on", Number(b.dataset.v) <= selected));
}
starBtns.forEach(b => b.onclick = () => { selected = Number(b.dataset.v); paintStars(); });

async function loadUserRating() {
    if (canUseCloud()) {
        const snap = await getDoc(doc(db, "ratings", currentUser.uid));
        if (snap.exists()) {
            selected = snap.data().value;
            $("ratingComment").value = snap.data().comment || "";
        }
    } else {
        const local = JSON.parse(localStorage.getItem("guestRating") || "null");
        if (local) { selected = local.value; $("ratingComment").value = local.comment || ""; }
    }
    paintStars();
}

$("ratingSubmit").onclick = async () => {
    const msg = $("ratingMsg");
    if (!selected) { msg.textContent = "Pilih bintang dulu ya."; return; }
    const data = { value: selected, comment: $("ratingComment").value.trim() };
    try {
        if (canUseCloud()) {
            await setDoc(doc(db, "ratings", currentUser.uid), {
                ...data, email: currentUser.email, updatedAt: serverTimestamp()
            });
            msg.textContent = "Makasih! Rating tersimpan di akun lo.";
        } else {
            localStorage.setItem("guestRating", JSON.stringify(data));
            msg.textContent = currentUser && !currentUser.emailVerified
                ? "Tersimpan lokal. Verifikasi email dulu biar masuk ke akun."
                : "Tersimpan lokal. Login (terverifikasi) biar tersimpan di akun.";
        }
        loadRatingSummary();
    } catch (e) { msg.textContent = "Gagal menyimpan: " + e.code; }
};

async function loadRatingSummary() {
    const el = $("ratingSummary");
    if (!cloudReady) { el.textContent = ""; return; }
    try {
        const snap = await getDocs(collection(db, "ratings"));
        if (snap.empty) { el.textContent = "Belum ada rating."; return; }
        let sum = 0;
        snap.forEach(d => sum += d.data().value);
        el.textContent = `⭐ Rata-rata ${(sum / snap.size).toFixed(1)} / 5 dari ${snap.size} pengguna`;
    } catch { el.textContent = ""; }
}

/* ===== 5. LAPORAN (tersimpan per user) ===== */
const esc = s => s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

$("reportSubmit").onclick = async () => {
    const text = $("reportText").value.trim();
    const msg = $("reportMsg");
    if (!text) { msg.textContent = "Isi laporan dulu ya."; return; }
    const data = { type: $("reportType").value, text };
    try {
        if (canUseCloud()) {
            await addDoc(collection(db, "reports"), {
                ...data, uid: currentUser.uid, email: currentUser.email, createdAt: serverTimestamp()
            });
            msg.textContent = "Laporan terkirim ke akun lo.";
        } else {
            const list = JSON.parse(localStorage.getItem("guestReports") || "[]");
            list.unshift({ ...data, createdAt: Date.now() });
            localStorage.setItem("guestReports", JSON.stringify(list));
            msg.textContent = "Tersimpan lokal (belum login/terverifikasi).";
        }
        $("reportText").value = "";
        loadReports();
    } catch (e) { msg.textContent = "Gagal mengirim: " + e.code; }
};

async function loadReports() {
    const ul = $("reportList");
    let items = [];
    try {
        if (canUseCloud()) {
            const snap = await getDocs(query(collection(db, "reports"), where("uid", "==", currentUser.uid)));
            snap.forEach(d => {
                const x = d.data();
                items.push({ ...x, createdAt: x.createdAt ? x.createdAt.toMillis() : Date.now() });
            });
        } else {
            items = JSON.parse(localStorage.getItem("guestReports") || "[]");
        }
    } catch { /* abaikan */ }
    items.sort((a, b) => b.createdAt - a.createdAt);
    ul.innerHTML = items.length
        ? items.map(i => `<li><b>${esc(i.type)}</b>: ${esc(i.text)}<small>${new Date(i.createdAt).toLocaleString("id-ID")}</small></li>`).join("")
        : "<li>Belum ada laporan.</li>";
}

/* Inisialisasi */
loadUserRating();
loadReports();
loadRatingSummary();
/* ===== 6. PENGATURAN: Profil, Tema, Shortcut ===== */

// Buka modal login/laporan dari halaman Settings
$("settingsLoginBtn").onclick = () => { renderAuth(); openModal("authModal"); };
$("settingsReportBtn").onclick = () => { openModal("reportModal"); loadReports(); };

// Update status akun di kartu Settings juga
const originalRenderAuth = renderAuth;
renderAuth = function () {
    originalRenderAuth();
    const el = $("settingsAccStatus");
    if (!cloudReady) { el.textContent = "Firebase belum dikonfigurasi"; return; }
    if (!currentUser) { el.textContent = "Belum masuk"; return; }
    el.textContent = currentUser.emailVerified
        ? `Masuk sebagai ${currentUser.email} ✅`
        : `Masuk sebagai ${currentUser.email} (belum verifikasi)`;
};

// Profil: nama tampilan
async function loadProfileName() {
    if (canUseCloud()) {
        const snap = await getDoc(doc(db, "profiles", currentUser.uid));
        $("displayName").value = snap.exists() ? (snap.data().name || "") : "";
    } else {
        $("displayName").value = localStorage.getItem("guestName") || "";
    }
}

$("saveProfile").onclick = async () => {
    const name = $("displayName").value.trim();
    const msg = $("profileMsg");
    if (!name) { msg.textContent = "Isi nama dulu ya."; return; }
    try {
        if (canUseCloud()) {
            await setDoc(doc(db, "profiles", currentUser.uid), { name, updatedAt: serverTimestamp() });
            msg.textContent = "Profil tersimpan di akun lo.";
        } else {
            localStorage.setItem("guestName", name);
            msg.textContent = "Tersimpan lokal. Login (terverifikasi) biar tersimpan di akun.";
        }
    } catch (e) { msg.textContent = "Gagal menyimpan: " + e.code; }
};

// Warna tema (ubah variabel CSS --red secara langsung)
const swatches = document.querySelectorAll(".swatch");
function applyAccent(color, dark, save = true) {
    document.documentElement.style.setProperty("--red", color);
    document.documentElement.style.setProperty(
        "--overlay",
        `linear-gradient(${hexToRgba(dark, .65)}, rgba(0,0,0,.65))`
    );
    swatches.forEach(s => s.classList.toggle("active", s.dataset.color === color));
    if (save) { localStorage.setItem("accentColor", color); localStorage.setItem("accentDark", dark); }
}
function hexToRgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
swatches.forEach(s => s.onclick = () => applyAccent(s.dataset.color, s.dataset.dark));

// Terapkan warna tersimpan saat halaman dibuka
const savedColor = localStorage.getItem("accentColor");
const savedDark = localStorage.getItem("accentDark");
if (savedColor && savedDark) applyAccent(savedColor, savedDark, false);

// Hapus data lokal
$("clearLocalBtn").onclick = () => {
    ["guestRating", "guestReports", "guestName", "accentColor", "accentDark"].forEach(k => localStorage.removeItem(k));
    $("clearMsg").textContent = "Data lokal dihapus. Refresh halaman untuk melihat perubahan.";
};

// Muat nama profil setiap kali status login berubah
if (cloudReady) {
    onAuthStateChanged(auth, () => loadProfileName());
} else {
    loadProfileName();
}