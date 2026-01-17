// Client-side logic: fetch videos, open modal, upload (client thumbnail optional), likes, comments.
async function api(path, opts={}) {
  const headers = opts.headers || {};
  const token = localStorage.getItem('token');
  if (token) headers['Authorization'] = 'Bearer ' + token;
  opts.headers = headers;
  const res = await fetch(path, opts);
  const json = await res.json().catch(()=>({}));
  if (!res.ok) throw json;
  return json;
}

const grid = document.getElementById('videosGrid');
const searchInput = document.getElementById('search');
const uploadLink = document.getElementById('uploadLink');
const uploadPanel = document.getElementById('uploadPanel');
const cancelUpload = document.getElementById('cancelUpload');
const userInfo = document.getElementById('userInfo');
const loginBtn = document.getElementById('loginBtn');
const regBtn = document.getElementById('regBtn');
const logoutBtn = document.getElementById('logoutBtn');

function updateAuthUI() {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (user) {
    userInfo.textContent = user.username;
    loginBtn.style.display = 'none';
    regBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-block';
  } else {
    userInfo.textContent = '';
    loginBtn.style.display = 'inline-block';
    regBtn.style.display = 'inline-block';
    logoutBtn.style.display = 'none';
  }
}
logoutBtn?.addEventListener('click', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  updateAuthUI();
});

async function loadVideos() {
  try {
    const res = await api('/api/videos');
    renderList(res.videos || []);
  } catch (err) {
    console.error(err);
    grid.innerHTML = '<div class="small">読み込み失敗</div>';
  }
}

function renderList(videos) {
  const q = (searchInput?.value || '').toLowerCase();
  const filtered = videos.filter(v => {
    if (!q) return true;
    return v.title.toLowerCase().includes(q) || (v.description || '').toLowerCase().includes(q);
  });
  grid.innerHTML = '';
  filtered.forEach(v => {
    const c = document.createElement('div'); c.className = 'card';
    const img = document.createElement('img'); img.className = 'thumb';
    img.src = v.thumbnailUrl || v.url;
    img.addEventListener('click', ()=>openModal(v));
    c.appendChild(img);
    const h = document.createElement('h4'); h.textContent = v.title;
    c.appendChild(h);
    const p = document.createElement('div'); p.className='small'; p.textContent = `${new Date(v.createdAt).toLocaleString()} • ❤ ${v.likes} • ${v.uploader || '匿名'}`;
    c.appendChild(p);
    grid.appendChild(c);
  });
}

searchInput?.addEventListener('input', loadVideos);

const modal = document.getElementById('modal');
const mTitle = document.getElementById('mTitle');
const mPlayer = document.getElementById('mPlayer');
const mDesc = document.getElementById('mDesc');
const likeBtn = document.getElementById('likeBtn');
const likeCount = document.getElementById('likeCount');
const closeModalBtn = document.getElementById('closeModal');
const commentsList = document.getElementById('commentsList');
const postCommentBtn = document.getElementById('postComment');
const uploaderInfo = document.getElementById('uploaderInfo');
const deleteVideoBtn = document.getElementById('deleteVideoBtn');

let currentVideo = null;

async function openModal(v) {
  currentVideo = v;
  mTitle.textContent = v.title;
  mPlayer.src = v.url;
  mDesc.textContent = v.description || '';
  likeCount.textContent = v.likes || 0;
  uploaderInfo.textContent = v.uploader ? `投稿者: ${v.uploader}` : '';
  // show delete button if current user is uploader
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  deleteVideoBtn.style.display = (user && user.username === v.uploader) ? 'inline-block' : 'none';
  modal.style.display = 'flex';
  // load comments
  try {
    const r = await api(`/api/videos/${v.id}/comments`);
    commentsList.innerHTML = '';
    (r.comments||[]).forEach(c => {
      const d = document.createElement('div');
      d.innerHTML = `<strong>${escapeHtml(c.author)}</strong> <div class="small">${escapeHtml(c.text)}</div><div class="small">${new Date(c.createdAt).toLocaleString()}</div>`;
      commentsList.appendChild(d);
    });
  } catch (err) { commentsList.innerHTML = '<div class="small">コメントの取得失敗</div>'; }
}

closeModalBtn?.addEventListener('click', ()=>{ modal.style.display='none'; mPlayer.pause(); mPlayer.src=''; });

likeBtn?.addEventListener('click', async () => {
  if (!currentVideo) return;
  try {
    const r = await api(`/api/videos/${currentVideo.id}/like`, { method: 'POST' });
    likeCount.textContent = r.likes;
    loadVideos();
  } catch (err) { console.error(err); alert('失敗'); }
});

postCommentBtn?.addEventListener('click', async () => {
  if (!currentVideo) return;
  const author = document.getElementById('cAuthor').value || '匿名';
  const text = document.getElementById('cText').value || '';
  if (!text.trim()) return alert('コメントを入力');
  try {
    await api(`/api/videos/${currentVideo.id}/comments`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ author, text }) });
    document.getElementById('cText').value = '';
    openModal(currentVideo); // refresh comments
    loadVideos();
  } catch (err) { console.error(err); alert(err?.error || 'コメント失敗'); }
});

deleteVideoBtn?.addEventListener('click', async () => {
  if (!currentVideo) return;
  if (!confirm('この動画を削除しますか？')) return;
  try {
    await api(`/api/videos/${currentVideo.id}`, { method: 'DELETE' });
    alert('削除しました');
    modal.style.display = 'none';
    loadVideos();
  } catch (err) { console.error(err); alert('削除失敗'); }
});

// upload logic
uploadLink?.addEventListener('click', (e)=> {
  e.preventDefault();
  const token = localStorage.getItem('token');
  if (!token) { alert('投稿にはログインが必要です'); location.href = '/login.html'; return; }
  uploadPanel.style.display = uploadPanel.style.display === 'block' ? 'none' : 'block';
});

cancelUpload?.addEventListener('click', ()=> uploadPanel.style.display = 'none');

document.getElementById('uploadForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById('fileInput');
  const file = fileInput.files[0];
  const title = document.getElementById('titleInput').value;
  const desc = document.getElementById('descInput').value;
  const generateThumb = document.getElementById('thumbCheckbox').checked;
  if (!file || !title) return alert('ファイルとタイトルが必要です');

  let thumbData = null;
  if (generateThumb) {
    try {
      thumbData = await captureThumbnailFromFile(file);
    } catch (err) { console.warn('thumb failed', err); }
  }

  const fd = new FormData();
  fd.append('file', file);
  fd.append('title', title);
  fd.append('description', desc);
  if (thumbData) fd.append('thumbnail', thumbData);

  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/videos', { method: 'POST', headers: token ? { 'Authorization': 'Bearer ' + token } : {}, body: fd });
    const j = await res.json();
    if (!res.ok) { alert(j.error || 'upload failed'); return; }
    alert('アップロード完了');
    uploadPanel.style.display = 'none';
    document.getElementById('uploadForm').reset();
    loadVideos();
  } catch (err) { console.error(err); alert('アップロードに失敗しました'); }
});

// client-side thumbnail capture (first frame ~1s)
function captureThumbnailFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.src = url;
    v.muted = true;
    v.playsInline = true;
    v.addEventListener('loadeddata', () => {
      const seekTo = Math.min(1, Math.max(0.2, v.duration * 0.1 || 0.5));
      v.currentTime = seekTo;
    });
    v.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = v.videoWidth || 640;
        canvas.height = v.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    });
    v.addEventListener('error', () => { URL.revokeObjectURL(url); reject(new Error('video load error')); });
  });
}

function escapeHtml(s){ if(!s) return ''; return s.replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

// init
updateAuthUI();
loadVideos();