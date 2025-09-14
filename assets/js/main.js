// Main JS module handling page behaviors and Firebase integration
// Improved auth detection and redirect handling.
//
// This file replaces pathname-based page checks with element-presence checks,
// and implements a redirect flow: protected pages redirect unauthenticated users
// to /auth/login.html?redirect=<originalPath>, and login/signup return the user
// to that redirect target after successful auth.

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-analytics.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getDatabase, ref, set, push, onValue, get, child } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";
import { getStorage, ref as sref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js";
import { firebaseConfig } from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
let analytics;
try { analytics = getAnalytics(app); } catch(e){ /* ignore in dev */ }
const auth = getAuth(app);
const db = getDatabase(app);
const storage = getStorage(app);

function $(sel){ return document.querySelector(sel); }
function $all(sel){ return Array.from(document.querySelectorAll(sel)); }

function getRedirectParam(){
  const urlp = new URLSearchParams(location.search);
  return urlp.get('redirect') || sessionStorage.getItem('engjoy_redirect') || null;
}
function clearRedirectParam(){
  sessionStorage.removeItem('engjoy_redirect');
}

// If a protected page is loaded and user is not authenticated, redirect to login with redirect param.
// We'll detect protected pages by presence of certain DOM elements.
function ensureAuthForProtectedPages(){
  // list of selectors that indicate pages that require auth:
  const protectedSelectors = [
    '#signout-btn',     // dashboard
    '#profile-area',    // dashboard
    '#record-btn',      // lesson player (submissions)
  ];
  const needsAuth = protectedSelectors.some(sel => document.querySelector(sel));
  if (!needsAuth) return;
  // If the page seems protected, set wantRedirect and check auth state
  let currentPath = location.pathname + location.search + location.hash;
  // normalize to absolute path
  const redirectTarget = location.href;
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      // store in sessionStorage as fallback
      sessionStorage.setItem('engjoy_redirect', redirectTarget);
      const loginUrl = '/auth/login.html?redirect=' + encodeURIComponent(redirectTarget);
      location.href = loginUrl;
    }
  });
}

// Call early
ensureAuthForProtectedPages();

// --- Auth flows for login/signup pages
const loginForm = $('#login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#email').value;
    const pw = $('#password').value;
    $('#login-msg').textContent = 'Logging in...';
    try {
      const userCred = await signInWithEmailAndPassword(auth, email, pw);
      $('#login-msg').textContent = '';
      // Redirect to intended page if provided
      const urlp = new URLSearchParams(location.search);
      const redirect = urlp.get('redirect') || sessionStorage.getItem('engjoy_redirect') ||const urlp = new URLSearchParams(location.search); const redirect = urlp.get('redirect') || sessionStorage.getItem('engjoy_redirect') || '/dashboard.html';
      clearRedirectParam();
      location.href = redirect;
    } catch(err) {
      $('#login-msg').textContent = err.message;
    }
  });
}

const signupForm = $('#signup-form');
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#name').value;
    const email = $('#email').value;
    const pw = $('#password').value;
    $('#signup-msg').textContent = 'Creating account...';
    try {
      const userCred = await createUserWithEmailAndPassword(auth, email, pw);
      const uid = userCred.user.uid;
      // create profile in RTDB
      await set(ref(db, `users/${uid}`), { name, email, createdAt: Date.now() });
      $('#signup-msg').textContent = '';
      const urlp = new URLSearchParams(location.search);
      const redirect = urlp.get('redirect') || sessionStorage.getItem('engjoy_redirect') ||const urlp = new URLSearchParams(location.search); const redirect = urlp.get('redirect') || sessionStorage.getItem('engjoy_redirect') || '/dashboard.html';
      clearRedirectParam();
      location.href = redirect;
    } catch(err) {
      $('#signup-msg').textContent = err.message;
    }
  });
}

// Dashboard: show profile and recommendations if page elements exist
if ($('#profile-area') || $('#recommendations')) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      // redirect to login with current path
      const target = location.pathname + location.search + location.hash;
      sessionStorage.setItem('engjoy_redirect', target);
      location.href = '/auth/login.html?redirect=' + encodeURIComponent(target);
      return;
    }
    const uid = user.uid;
    const profileArea = $('#profile-area');
    const rec = $('#recommendations');
    if (profileArea) {
      profileArea.textContent = 'Loading profile...';
      const userSnap = await get(child(ref(db), `users/${uid}`));
      const profile = userSnap.exists() ? userSnap.val() : { name: 'New User' };
      profileArea.innerHTML = `<div class="text-sm"><strong>${profile.name || profile.email}</strong><div class="text-xs text-gray-500">Joined: ${new Date(profile.createdAt||Date.now()).toLocaleDateString()}</div></div>`;
      const mini = document.getElementById('mini-profile'); if (mini) mini.innerHTML = `<div class="font-semibold">${profile.name || profile.email}</div><div class="text-xs text-gray-500">Level: ${profile.level || 'Not set'}</div>`;
    }
    if (rec) {
      onValue(ref(db, 'courses'), (snapshot) => {
        const val = snapshot.val() || {};
        rec.innerHTML = '';
        if (Object.keys(val).length===0){ grid.innerHTML = '<div class="p-4 bg-white rounded shadow">No courses available.</div>'; } Object.keys(val).forEach(k=>{
          const c = val[k];
          const card = document.createElement('div');
          card.className = 'p-4 border rounded';
          card.innerHTML = `<h4 class="font-semibold">${c.title}</h4><p class="text-sm text-gray-600">${c.description}</p><a class="mt-3 inline-block text-indigo-600" href="/courses/course.html?id=${k}">Open</a>`;
          rec.appendChild(card);
        });
      });
    }
  });

  const signoutBtn = $('#signout-btn');
  if (signoutBtn) {
    signoutBtn.addEventListener('click', async ()=>{
      await signOut(auth);
      location.href = '/';
    });
  }
}

// Courses list page
if ($('#courses-grid')) {
  const grid = $('#courses-grid');
  onValue(ref(db, 'courses'), (snapshot) => {
    const val = snapshot.val() || {};
    grid.innerHTML = '';
    if (Object.keys(val).length===0){ grid.innerHTML = '<div class="p-4 bg-white rounded shadow">No courses available.</div>'; } Object.keys(val).forEach(k=>{
      const c = val[k];
      const el = document.createElement('div');
      el.className = 'bg-white p-4 rounded shadow';
      el.innerHTML = `<h3 class="font-semibold">${c.title}</h3><p class="text-sm text-gray-600 mt-2">${c.description}</p><a class="inline-block mt-3 text-indigo-600" href="/courses/course.html?id=${k}">View course</a>`;
      grid.appendChild(el);
    });
  });
}

// Course detail
if ($('#course-title')) {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  if (!id) {
    $('#course-title').textContent = 'Course not found';
  } else {
    onValue(ref(db, `courses/${id}`), (snap)=>{
      if (!snap.exists()) {
        $('#course-title').textContent = 'Not found';
        return;
      }
      const c = snap.val();
      $('#course-title').textContent = c.title;
      $('#course-desc').textContent = c.description;
      const lessons = c.lessons || {};
      const list = $('#lessons-list');
      list.innerHTML = '';
      Object.keys(lessons).forEach(lid=>{
        const lesson = lessons[lid];
        const item = document.createElement('div');
        item.className = 'p-3 border rounded flex justify-between items-center';
        item.innerHTML = `<div><div class="font-medium">${lesson.title}</div><div class="text-sm text-gray-500">${lesson.duration || '—'}</div></div><a class="px-3 py-2 bg-indigo-50 border rounded" href="/lesson/player.html?course=${id}&lesson=${lid}">Open</a>`;
        list.appendChild(item);
      });
    });
  }
}

// Lesson player + recorder
if ($('#lesson-title') || $('#record-btn')) {
  const params = new URLSearchParams(location.search);
  const courseId = params.get('course');
  const lessonId = params.get('lesson');
  const titleEl = $('#lesson-title');
  const descEl = $('#lesson-desc');
  const audioEl = $('#lesson-audio');
  const recordingsEl = $('#recordings');
  const recordBtn = $('#record-btn');
  const stopBtn = $('#stop-btn');

  if (courseId && lessonId) {
    onValue(ref(db, `courses/${courseId}/lessons/${lessonId}`), (snap)=>{
      if (!snap.exists()) return;
      const data = snap.val();
      if (titleEl) titleEl.textContent = data.title;
      if (descEl) descEl.textContent = data.description || '';
      if (audioEl && data.audioUrl) audioEl.src = data.audioUrl;
    });
  }

  // Recorder
  let mediaRecorder;
  let chunks = [];
  if (recordBtn) {
    recordBtn.addEventListener('click', async ()=>{
      if (!navigator.mediaDevices) {
        alert('녹음 지원이 안되는 브라우저입니다.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e)=> chunks.push(e.data);
        mediaRecorder.onstop = async ()=>{
          const blob = new Blob(chunks, { type: 'audio/webm' });
          chunks = [];
          const url = URL.createObjectURL(blob);
          const a = document.createElement('audio');
          a.controls = true; a.src = url;
          recordingsEl.prepend(a);

          // if logged in, upload to storage & save record metadata
          const user = auth.currentUser;
          if (user) {
            const uid = user.uid;
            const fname = `submissions/${uid}/${Date.now()}.webm`;
            const storageRef = sref(storage, fname);
            try {
              const snap = await uploadBytes(storageRef, blob);
              const downloadURL = await getDownloadURL(snap.ref);
              await push(ref(db, `submissions/${uid}`), { lessonId, courseId, audioUrl: downloadURL, createdAt: Date.now() });
            } catch(err) {
              console.error('Upload failed', err);
            }
          } else {
            // not logged in: prompt and save recording temporarily
            alert('녹음을 업로드하려면 로그인하세요.');
            sessionStorage.setItem('engjoy_pending_audio', url);
          }
        };
        mediaRecorder.start();
        recordBtn.disabled = true; stopBtn.disabled = false;
      } catch(err) {
        alert('녹음 권한을 허용해 주세요.');
        console.error(err);
      }
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener('click', ()=>{
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        recordBtn.disabled = false; stopBtn.disabled = true;
      }
    });
  }
}

// CMS actions
if ($('#course-form')) {
  const saveBtn = $('#save-course');
  const seedBtn = $('#seed-data');
  saveBtn.addEventListener('click', async (e)=>{
    e.preventDefault();
    const id = $('#course-id').value || Date.now().toString(36);
    const title = $('#course-title-input').value;
    const desc = $('#course-desc-input').value;
    await set(ref(db, `courses/${id}`), { title, description: desc, createdAt: Date.now() });
    $('#cms-msg').textContent = 'Saved.';
  });
  seedBtn.addEventListener('click', async (e)=>{
    e.preventDefault();
    const sample = {
      "everyday": {
        title: "Everyday Essentials",
        description: "기초 생활 영어",
        lessons: {
          "l1": { title: "Greetings & Intro", description: "Self-intro practice", duration: "8m", audioUrl: "" },
          "l2": { title: "Ordering food", description: "Restaurant dialogues", duration: "10m", audioUrl: "" }
        }
      },
      "travel": {
        title: "Travel & Survival English",
        description: "여행 필수 표현",
        lessons: {
          "l1": { title: "At the airport", description: "Check-in & security", duration: "9m", audioUrl: "" }
        }
      }
    };
    await set(ref(db, 'courses'), sample);
    $('#cms-msg').textContent = 'Sample data seeded.';
  });
}

// Placement test page actions
if ($('#submit-test')) {
  const submit = $('#submit-test');
  const saveBtn = $('#save-test');
  const result = $('#result');

  submit && submit.addEventListener('click', ()=>{
    const a1 = document.querySelector('input[name="q1"]:checked')?.value;
    const a2 = document.querySelector('input[name="q2"]:checked')?.value;
    let score = 0;
    if (a1 === 'b') score++;
    if (a2 === 'b') score++;
    let level = 'Beginner';
    if (score === 2) level = 'Intermediate';
    result.classList.remove('hidden');
    result.innerHTML = `<div>Score: ${score}/2 — Suggested level: <strong>${level}</strong></div>`;
  });

  saveBtn && saveBtn.addEventListener('click', async ()=>{
    const user = auth.currentUser;
    if (!user) { alert('로그인이 필요합니다.'); location.href = '/auth/login.html'; return; }
    const a1 = document.querySelector('input[name="q1"]:checked')?.value;
    const a2 = document.querySelector('input[name="q2"]:checked')?.value;
    const score = (a1==='b') + (a2==='b');
    await push(ref(db, `placements/${user.uid}`), { score, createdAt: Date.now() });
    alert('저장되었습니다.');
  });
}

// Global: onAuth change to show basic nav or console
// Global auth state handling: update header nav and enforce placement requirement for dashboard.
onAuthStateChanged(auth, async (user) => {
  const headerNav = document.querySelector('nav.header-nav');
  // update nav UI
  if (headerNav) {
    headerNav.innerHTML = '';
    const coursesLink = document.createElement('a');
    coursesLink.href = '/courses/list.html';
    coursesLink.textContent = 'Courses';
    coursesLink.className = 'text-sm hover:underline mr-3';
    headerNav.appendChild(coursesLink);

    const placementLink = document.createElement('a');
    placementLink.href = '/placement.html';
    placementLink.textContent = 'Placement';
    placementLink.className = 'text-sm hover:underline mr-3';
    headerNav.appendChild(placementLink);

    if (user) {
      // show dashboard and profile + sign out
      const dash = document.createElement('a');
      dash.href =const urlp = new URLSearchParams(location.search); const redirect = urlp.get('redirect') || sessionStorage.getItem('engjoy_redirect') || '/dashboard.html';
      dash.textContent = 'Dashboard';
      dash.className = 'text-sm hover:underline mr-3';
      headerNav.appendChild(dash);

      const profileBtn = document.createElement('button');
      profileBtn.className = 'px-3 py-2 bg-indigo-600 text-white rounded text-sm';
      profileBtn.textContent = 'My Page';
      profileBtn.addEventListener('click', ()=> { location.href =const urlp = new URLSearchParams(location.search); const redirect = urlp.get('redirect') || sessionStorage.getItem('engjoy_redirect') || '/dashboard.html'; });
      headerNav.appendChild(profileBtn);

      const signout = document.createElement('button');
      signout.className = 'ml-2 px-3 py-2 bg-gray-200 rounded text-sm';
      signout.textContent = 'Sign out';
      signout.addEventListener('click', async ()=>{
        await signOut(auth);
        location.href = '/';
      });
      headerNav.appendChild(signout);
    } else {
      const login = document.createElement('a');
      login.href = '/auth/login.html';
      login.className = 'px-3 py-2 bg-indigo-500 text-white rounded text-sm';
      login.textContent = 'Login';
      headerNav.appendChild(login);
    }
  }

  // If user is on dashboard page (or accessing dashboard content), ensure they completed placement
  const isDashboardPath = location.pathname.endsWith('/dashboard.html') || document.querySelector('[data-page="dashboard.html"]');
  if (isDashboardPath) {
    if (!user) {
      // redirect to login, will come back by redirect param
      sessionStorage.setItem('engjoy_redirect', location.href);
      location.href = '/auth/login.html?redirect=' + encodeURIComponent(location.href);
      return;
    } else {
      // check if user has level set
      try {
        const userSnap = await get(child(ref(db), `users/${user.uid}/level`));
        const level = userSnap.exists() ? userSnap.val() : null;
        if (!level) {
          // redirect to placement test to ensure they take it first
          sessionStorage.setItem('engjoy_redirect', location.href);
          alert('대시보드에 접근하려면 먼저 배치 테스트를 완료해 주세요.');
          location.href = '/placement.html?redirect=' + encodeURIComponent(location.href);
          return;
        } else {
          // ok to stay; optionally update mini-profile if exists
          const mini = document.getElementById('mini-profile');
          if (mini) {
            const userSnap2 = await get(child(ref(db), `users/${user.uid}`));
            const profile = userSnap2.exists() ? userSnap2.val() : {};
            mini.innerHTML = `<div class="font-semibold">${profile.name || user.email}</div><div class="text-xs text-gray-500">Level: ${profile.level || level}</div>`;
          }
        }
      } catch(err) {
        console.error('Error checking user level', err);
      }
    }
  }

});



// Level-up test handling
if (document.getElementById('submit-levelup')) {
  document.getElementById('submit-levelup').addEventListener('click', async ()=>{
    const answers = { lq1: 'b', lq2: 'a', lq3: 'a', lq4: 'a', lq5: 'a' };
    let score = 0;
    for (let i=1;i<=5;i++){
      const a = document.querySelector('input[name=const mini = document.getElementById('mini-profile'); if (mini) mini.innerHTML = `<div class="font-semibold">${profile.name || user.email}</div><div class="text-xs text-gray-500">Level: ${profile.level || level}</div>`;
          // show assigned course in dashboard
          const ac = document.getElementById('assigned-course'); if (ac) { try { get(child(ref(db), `courses/${profile.assignedCourse || ''}`)).then(snap=>{ if (snap.exists()) ac.innerHTML = `<div class="font-medium">Assigned: ${snap.val().title}</div><div class="text-xs text-gray-500">Level: ${snap.val().level || '—'}</div>`; else ac.innerHTML='No assigned course.'; }).catch(()=>{ ac.innerHTML='No assigned course.'; }); } catch(e){ ac.innerHTML='No assigned course.'; }"lq'+i+'const mini = document.getElementById('mini-profile'); if (mini) mini.innerHTML = `<div class="font-semibold">${profile.name || user.email}</div><div class="text-xs text-gray-500">Level: ${profile.level || level}</div>`;
          // show assigned course in dashboard
          const ac = document.getElementById('assigned-course'); if (ac) { try { get(child(ref(db), `courses/${profile.assignedCourse || ''}`)).then(snap=>{ if (snap.exists()) ac.innerHTML = `<div class="font-medium">Assigned: ${snap.val().title}</div><div class="text-xs text-gray-500">Level: ${snap.val().level || '—'}</div>`; else ac.innerHTML='No assigned course.'; }).catch(()=>{ ac.innerHTML='No assigned course.'; }); } catch(e){ ac.innerHTML='No assigned course.'; }"]:checked')?.value;
      if (a && a === answers['lq'+i]) score++;
    }
    const req = document.getElementById('levelup-result');
    req.classList.remove('hidden');
    req.innerHTML = `<div>Score: ${score}/5</div>`;
    if (score >= 4) {
      // promote user level by one step
      const user = auth.currentUser;
      if (!user) { alert('Please login to apply level-up.'); location.href = '/auth/login.html?redirect=' + encodeURIComponent(location.href); return; }
      try {
        const snap = await get(child(ref(db), `users/${user.uid}/level`));
        let cur = snap.exists() ? snap.val() : 'Starter';
        const order = ['Starter','Beginner','Intermediate','Upper-Intermediate','Advanced'];
        const idx = order.indexOf(cur);
        if (idx < order.length-1) {
          const next = order[idx+1];
          await set(ref(db, `users/${user.uid}/level`), next);
          req.innerHTML += `<div class="mt-2">Congratulations! Your level has been promoted to <strong>${next}</strong>.</div>`;const mini = document.getElementById('mini-profile'); if (mini) mini.innerHTML = `<div class="font-semibold">${profile.name || user.email}</div><div class="text-xs text-gray-500">Level: ${profile.level || level}</div>`;
          // show assigned course in dashboard
          const ac = document.getElementById('assigned-course'); if (ac) { try { get(child(ref(db), `courses/${profile.assignedCourse || ''}`)).then(snap=>{ if (snap.exists()) ac.innerHTML = `<div class="font-medium">Assigned: ${snap.val().title}</div><div class="text-xs text-gray-500">Level: ${snap.val().level || '—'}</div>`; else ac.innerHTML='No assigned course.'; }).catch(()=>{ ac.innerHTML='No assigned course.'; }); } catch(e){ ac.innerHTML='No assigned course.'; }n          // optionally assign a new course at next level
          try {
            const coursesSnap = await get(child(ref(db), 'courses'));
            if (coursesSnap.exists()) {
              const courses = coursesSnap.val();
              let assigned=null;
              Object.keys(courses).some(cid=>{ if((courses[cid].level||'').toLowerCase()===next.toLowerCase()){ assigned=cid; return true;} });
              if (assigned) {
                await set(ref(db, `users/${user.uid}/assignedCourse`), assigned);
                await set(ref(db, `users/${user.uid}/courses/${assigned}`), { enrolledAt: Date.now() });
                req.innerHTML += `<div class="mt-2">A recommended course has been assigned to your dashboard.</div>`;
              }
            }
          } catch(e){ console.error('assign after levelup', e); }
        } else {
          req.innerHTML += `<div class="mt-2">You're already at the highest level.</div>`;
        }
      } catch(err){ console.error(err); req.innerHTML += '<div class="mt-2 text-red-600">Unable to update level.</div>'; }
    } else {
      req.innerHTML += `<div class="mt-2">Not enough correct answers to level up. Try again later.</div>`;
    }
  });
}
