// Cookie check (redirect to /index.html if access cookie not set)
function checkCookie() {
    const cookies = document.cookie ? document.cookie.split("; ") : [];
    const accessCookie = cookies.find(row => row.startsWith("access="));
    if (!accessCookie || accessCookie.split("=")[1] !== "1") {
        window.location.href = "/index.html"; // Redirect if no valid cookie
    }
}
checkCookie();

document.addEventListener('DOMContentLoaded', () => {
  const API_HOST = "youtube-search-and-download.p.rapidapi.com";
  const API_KEY = "9ec66b72c3msh613b7170aa0f367p16f361jsnb2d50755d6fc";
  const PAGE_SIZE = 5;

  const q = document.getElementById('q');
  const btnSearch = document.getElementById('btnSearch');
  const btnTrending = document.getElementById('btnTrending');
  const region = document.getElementById('region');
  const grid = document.getElementById('grid');
  const prev = document.getElementById('prev');
  const next = document.getElementById('next');
  const player = document.getElementById('player');
  const nowTitle = document.getElementById('nowTitle');
  const nowChannel = document.getElementById('nowChannel');

  let currentItems = [];
  let pageIndex = 0;

  // Format helpers
  function fmtInt(n){const num=Number(n||0);if(num>=1e6)return(num/1e6).toFixed(1)+"M";if(num>=1e3)return(num/1e3).toFixed(1)+"K";return num;}
  function fmtDur(s){if(s==null)return"";s=Number(s);const m=Math.floor(s/60),sec=s%60;return `${m}:${String(sec).padStart(2,'0')}`;}

  // Extract YouTube ID from URL or raw input
  function extractYouTubeID(input){
    if(!input) return null;
    input = input.trim();
    // raw id (11 chars)
    if(/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
    try{
      const u = new URL(input);
      if(u.hostname.includes('youtu.be')) return u.pathname.slice(1);
      if(u.hostname.includes('youtube.com')){
        const p = new URLSearchParams(u.search);
        if(p.has('v')) return p.get('v');
        // sometimes in /shorts/VIDEOID or /embed/VIDEOID
        const parts = u.pathname.split('/');
        return parts.pop() || null;
      }
    } catch(e){}
    return null;
  }

  // Play video and reveal player (switch to side layout)
  function playVideo(id,title,channel){
    // Show player and use embed params to minimize YouTube UI:
    // controls=0  -> hide player controls
    // modestbranding=1 -> remove YouTube logo from controls (not all branding)
    // rel=0 -> don't show related videos from other channels (best-effort)
    // iv_load_policy=3 -> disable annotations
    // playsinline=1 -> prefer inline playback on mobile
    document.body.classList.add('player-open');
    const playerBox = document.querySelector('.player');
    if (playerBox) playerBox.style.display = "block";

    // Use the nocookie domain if you prefer reduced tracking: youtube-nocookie.com
    player.src = `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3`;

    nowTitle.textContent = title || `Video ${id}`;
    nowChannel.textContent = channel || "";
    playerBox?.scrollIntoView({behavior:"smooth",block:"start"});
  }

  // Normalize API data
  function normalize(data){
    const out=[];
    if(Array.isArray(data?.contents)){
      for(const c of data.contents){
        const v=c.video||c;
        if(!v)continue;
        out.push({id:v.videoId,title:v.title,channel:v.channelName,thumb:v.thumbnails?.[0]?.url,views:v.viewCount,duration:v.lengthSeconds});
      }
    } else if(Array.isArray(data?.videos)){
      for(const v of data.videos){
        out.push({id:v.videoId||v.id,title:v.title,channel:v.uploaderName,thumb:v.thumbnail,views:v.views,duration:v.duration});
      }
    }
    return out.filter(x=>x.id);
  }

  // Render current page
  function renderPage(){
    grid.innerHTML="";
    const start=pageIndex*PAGE_SIZE;
    const slice=currentItems.slice(start,start+PAGE_SIZE);
    slice.forEach(item=>{
      const card=document.createElement("div");
      card.className="card";
      card.innerHTML=`
        <div class="thumb">
          <img src="${item.thumb}" alt="">
          <div class="duration">${fmtDur(item.duration)}</div>
        </div>
        <div class="info">
          <div class="title">${item.title}</div>
          <div class="channel">${item.channel}</div>
          <div class="stats">${fmtInt(item.views)} views</div>
        </div>`;
      card.onclick=()=>playVideo(item.id,item.title,item.channel);
      grid.appendChild(card);
    });
    prev.disabled=pageIndex===0;
    next.disabled=(start+PAGE_SIZE)>=currentItems.length;
  }

  // Fetch helper
  async function fetchAPI(path){
    const res=await fetch(`https://${API_HOST}${path}`,{
      headers: {
        "X-RapidAPI-Key": API_KEY,
        "X-RapidAPI-Host": API_HOST
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // Load trending
  async function loadTrending(){
    try {
      // Hide player and reset layout when going home
      document.body.classList.remove('player-open');
      const playerBox = document.querySelector('.player');
      if (playerBox) playerBox.style.display = "none";
      nowTitle.textContent = "Pick a video";
      nowChannel.textContent = "";

      const geo = region.value || "US";
      const data = await fetchAPI(`/trending?geo=${encodeURIComponent(geo)}`);
      currentItems = normalize(data);
      pageIndex = 0;
      renderPage();
    } catch (err) {
      console.error(err);
    }
  }

  // Search
  async function searchVideos(){
    const query = q.value.trim();
    if (!query) return;
    // If the input is a YouTube URL or raw id, play immediately
    const id = extractYouTubeID(query);
    if(id){
      playVideo(id, `YouTube Video`, "");
      return;
    }

    // Otherwise close player until user clicks a result
    document.body.classList.remove('player-open');
    document.querySelector('.player').style.display = "none";

    try {
      const data = await fetchAPI(`/search?query=${encodeURIComponent(query)}`);
      currentItems = normalize(data);
      pageIndex = 0;
      renderPage();
    } catch (err) {
      console.error(err);
    }
  }

  // Pagination
  function doPrev(){if(pageIndex>0){pageIndex--;renderPage();}}
  function doNext(){if((pageIndex+1)*PAGE_SIZE<currentItems.length){pageIndex++;renderPage();}}

  // Event bindings
  btnTrending.addEventListener("click", loadTrending);
  btnSearch.addEventListener("click", searchVideos);
  q.addEventListener("keydown", e => { if (e.key === "Enter") searchVideos(); });
  prev.addEventListener("click", doPrev);
  next.addEventListener("click", doNext);
  region.addEventListener("change", loadTrending);

  // Add logo click to go home
  const logoEl = document.getElementById('logo');
  if (logoEl) {
    logoEl.addEventListener('click', () => {
      q.value = "";
      loadTrending();
    });
  }

  // Initial load
  loadTrending();
  // player hidden by default via CSS
});
