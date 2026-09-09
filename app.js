/* SkyRide - pure HTML/CSS/JS + Supabase JS v2 */
const { createClient } = window.supabase;
const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = window.SKYRIDE_CONFIG;
const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let session = null;
let profile = null;
let currentBoard = "notice";
let eventsCache = [];

const $ = (id) => document.getElementById(id);
const esc = (s="") => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const fmtDate = (v) => v ? new Intl.DateTimeFormat("ko-KR",{dateStyle:"medium"}).format(new Date(v+"T00:00:00")) : "";
const toast = (msg, error=false) => {
  const el=$("toast"); el.textContent=msg; el.style.background=error?"#a92f3b":"#0c2638"; el.classList.add("show");
  clearTimeout(window.__toast); window.__toast=setTimeout(()=>el.classList.remove("show"),2800);
};
const openModal=(id)=>$(id).classList.remove("hidden");
const closeModal=(id)=>$(id).classList.add("hidden");

function requireAuth(){
  if(!session){ openModal("authModal"); toast("로그인 후 이용할 수 있습니다.", true); return false; }
  return true;
}
function isAdmin(){ return profile?.role === "admin"; }

async function loadProfile(){
  if(!session){ profile=null; return; }
  const {data,error}=await db.from("rc_profiles").select("*").eq("id",session.user.id).maybeSingle();
  if(error) console.warn(error);
  profile=data;
}

function updateAuthUI(){
  $("loginBtn").classList.toggle("hidden",!!session);
  $("signupBtn").classList.toggle("hidden",!!session);
  $("logoutBtn").classList.toggle("hidden",!session);
  $("userLabel").textContent = session ? (profile?.display_name || session.user.email || "") : "";
  $("newEventBtn").textContent = isAdmin() ? "+ 정기모임 등록" : "+ 정기모임 등록";
  $("newSmallEventBtn").textContent = "+ 소모임 등록";
}

async function loadEvents(){
  const {data,error}=await db.from("rc_events").select("*, rc_event_applications(count)").order("event_date",{ascending:true}).order("event_time",{ascending:true});
  if(error){ console.error(error); $("regularEvents").innerHTML=`<div class="empty">이벤트 데이터를 불러오지 못했습니다. Supabase SQL을 먼저 실행해 주세요.</div>`; $("smallEvents").innerHTML=""; return; }
  eventsCache=data||[];
  renderEvents("regular", data.filter(x=>x.event_type==="regular"));
  renderEvents("small", data.filter(x=>x.event_type==="small"));
}

function renderEvents(type, items){
  const target=type==="regular"?$("regularEvents"):$("smallEvents");
  if(!items.length){ target.innerHTML=`<div class="empty">아직 등록된 모임이 없습니다.</div>`; return; }
  target.innerHTML=items.map((e,i)=>{
    const count=e.rc_event_applications?.[0]?.count ?? 0;
    const image=i%3===0?"https://images.unsplash.com/photo-1502744688674-c619d1586c9e?auto=format&fit=crop&w=900&q=80":i%3===1?"https://images.unsplash.com/photo-1511994298241-608e28f14fde?auto=format&fit=crop&w=900&q=80":"https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=900&q=80";
    return `<article class="ride-card">
      <div class="ride-cover" style="background-image:url('${image}')"><span class="ride-badge">${e.region||"지역"} · ${e.event_type==="regular"?"정기":"소모임"}</span></div>
      <div class="ride-body"><h3>${esc(e.title)}</h3>
      <div class="ride-meta"><span>📅 ${fmtDate(e.event_date)}</span><span>⏱ ${esc(e.event_time||"")}</span><span>📍 ${esc(e.meeting_point||"")}</span></div>
      <p class="ride-desc">${esc(e.description||"")}</p>
      <div class="ride-footer"><span class="capacity">${count} / ${e.capacity}명 신청</span><button class="btn btn-primary" onclick="showEvent('${e.id}')">자세히</button></div></div>
    </article>`;
  }).join("");
}

window.showEvent=async(id)=>{
  const e=eventsCache.find(x=>x.id===id); if(!e)return;
  const {data:apps}=await db.from("rc_event_applications").select("*, rc_profiles(display_name)").eq("event_id",id).order("created_at",{ascending:true});
  const mine=apps?.some(a=>a.user_id===session?.user?.id);
  const count=apps?.length||0;
  const image="https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1200&q=80";
  $("eventDetail").innerHTML=`<div class="detail-hero" style="background-image:url('${image}')"></div>
    <div class="section-kicker">${e.event_type==="regular"?"ANNUAL RIDE":"SMALL RIDE"} · ${esc(e.region)}</div>
    <h3>${esc(e.title)}</h3>
    <div class="detail-meta"><span>📅 ${fmtDate(e.event_date)} ${esc(e.event_time||"")}</span><span>📍 ${esc(e.meeting_point||"")}</span><span>👥 ${count}/${e.capacity}명</span></div>
    <p>${esc(e.description||"").replace(/\n/g,"<br>")}</p>
    <div class="detail-actions">
      ${session ? (mine ? `<button class="btn btn-outline" onclick="cancelApplication('${e.id}')">신청 취소</button>` : `<button class="btn btn-primary" onclick="applyEvent('${e.id}')">참가 신청</button>`) : `<button class="btn btn-primary" onclick="openModal('authModal')">로그인 후 신청</button>`}
      ${session && (e.created_by===session.user.id || isAdmin()) ? `<button class="btn btn-outline" onclick="editEvent('${e.id}')">수정</button><button class="btn btn-outline" onclick="deleteEvent('${e.id}')">삭제</button>`:""}
    </div>
    <div class="application-list"><h4>참가 신청자</h4>
      ${(apps||[]).map(a=>`<div class="application-row"><span>${esc(a.rc_profiles?.display_name||"라이더")}</span><span>${new Date(a.created_at).toLocaleDateString("ko-KR")}</span></div>`).join("") || "<p class='modal-note'>아직 신청자가 없습니다.</p>"}
    </div>`;
  openModal("eventDetailModal");
};

window.applyEvent=async(id)=>{
  if(!requireAuth())return;
  const e=eventsCache.find(x=>x.id===id); if(!e)return;
  const {count,error:countError}=await db.from("rc_event_applications").select("*",{count:"exact",head:true}).eq("event_id",id);
  if(countError){toast(countError.message,true);return}
  if((count||0)>=e.capacity){toast("정원이 마감되었습니다.",true);return}
  const {error}=await db.from("rc_event_applications").insert({event_id:id,user_id:session.user.id});
  if(error){toast(error.code==="23505"?"이미 신청한 모임입니다.":error.message,true);return}
  toast("참가 신청이 완료되었습니다."); await loadEvents(); await showEvent(id);
};

window.cancelApplication=async(id)=>{
  const {error}=await db.from("rc_event_applications").delete().eq("event_id",id).eq("user_id",session.user.id);
  if(error){toast(error.message,true);return} toast("신청이 취소되었습니다."); await loadEvents(); await showEvent(id);
};

window.editEvent=(id)=>{
  const e=eventsCache.find(x=>x.id===id); if(!e)return;
  $("eventId").value=e.id;$("eventType").value=e.event_type;$("eventTitle").value=e.title;$("eventDate").value=e.event_date;$("eventTime").value=e.event_time||"";
  $("eventRegion").value=e.region||"";$("eventCapacity").value=e.capacity;$("eventMeetingPoint").value=e.meeting_point||"";$("eventDescription").value=e.description||"";
  $("eventModalTitle").textContent="라이딩 수정"; closeModal("eventDetailModal"); openModal("eventModal");
};
window.deleteEvent=async(id)=>{
  if(!confirm("이 모임을 삭제할까요?"))return;
  const {error}=await db.from("rc_events").delete().eq("id",id);
  if(error){toast(error.message,true);return} closeModal("eventDetailModal"); toast("모임이 삭제되었습니다."); loadEvents();
};

async function saveEvent(ev){
  ev.preventDefault(); if(!requireAuth())return;
  const payload={title:$("eventTitle").value.trim(),event_date:$("eventDate").value,event_time:$("eventTime").value,region:$("eventRegion").value.trim(),capacity:Number($("eventCapacity").value),meeting_point:$("eventMeetingPoint").value.trim(),description:$("eventDescription").value.trim(),event_type:$("eventType").value};
  const id=$("eventId").value;
  let result=id?await db.from("rc_events").update(payload).eq("id",id):await db.from("rc_events").insert({...payload,created_by:session.user.id});
  if(result.error){toast(result.error.message,true);return}
  closeModal("eventModal"); ev.target.reset(); $("eventId").value=""; toast(id?"수정되었습니다.":"등록되었습니다."); loadEvents();
}

async function loadPosts(){
  let q=db.from("rc_posts").select("*, rc_profiles(display_name)").eq("board_type",currentBoard).order("created_at",{ascending:false});
  const term=$("boardSearch").value.trim(); if(term) q=q.or(`title.ilike.%${term}%,content.ilike.%${term}%`);
  const {data,error}=await q;
  if(error){$("postsList").innerHTML=`<div class="empty">게시글을 불러오지 못했습니다. SQL 설정을 확인하세요.</div>`;return}
  if(!data?.length){$("postsList").innerHTML=`<div class="empty">등록된 게시글이 없습니다.</div>`;return}
  $("postsList").innerHTML=data.map((p,i)=>`<div class="post-row">
    <span class="post-no">${data.length-i}</span><div class="post-title"><span onclick="viewPost('${p.id}')" style="cursor:pointer">${esc(p.title)}</span><small>${esc(p.rc_profiles?.display_name||"회원")} · ${new Date(p.created_at).toLocaleDateString("ko-KR")}</small></div>
    <span class="post-meta">${p.view_count||0} views</span>
    <div class="post-actions">${session&&(p.user_id===session.user.id||isAdmin())?`<button class="mini-btn" onclick="editPost('${p.id}')">수정</button><button class="mini-btn" onclick="deletePost('${p.id}')">삭제</button>`:""}</div>
  </div>`).join("");
}

window.viewPost=async(id)=>{
  const {data:p,error}=await db.from("rc_posts").select("*, rc_profiles(display_name)").eq("id",id).single(); if(error)return;
  await db.from("rc_posts").update({view_count:(p.view_count||0)+1}).eq("id",id);
  alert(`[${p.board_type}] ${p.title}\n\n${p.content}`);
};
window.editPost=async(id)=>{
  const {data:p}=await db.from("rc_posts").select("*").eq("id",id).single(); if(!p)return;
  $("postId").value=p.id;$("postBoard").value=p.board_type;$("postTitle").value=p.title;$("postContent").value=p.content;$("postModalTitle").textContent="게시글 수정";openModal("postModal");
};
window.deletePost=async(id)=>{
  if(!confirm("게시글을 삭제할까요?"))return; const {error}=await db.from("rc_posts").delete().eq("id",id);
  if(error){toast(error.message,true);return}toast("삭제되었습니다.");loadPosts();
};
async function savePost(ev){
  ev.preventDefault();if(!requireAuth())return;
  const payload={board_type:$("postBoard").value,title:$("postTitle").value.trim(),content:$("postContent").value.trim()};
  const id=$("postId").value;const result=id?await db.from("rc_posts").update(payload).eq("id",id):await db.from("rc_posts").insert({...payload,user_id:session.user.id});
  if(result.error){toast(result.error.message,true);return}closeModal("postModal");ev.target.reset();$("postId").value="";toast(id?"수정되었습니다.":"등록되었습니다.");loadPosts();
}

async function authSubmit(ev){
  ev.preventDefault();
  const email=$("authEmail").value.trim(),password=$("authPassword").value;const signup=$("authSubmit").dataset.mode==="signup";
  if(signup){
    const name=$("authName").value.trim()||email.split("@")[0];
    const {error}=await db.auth.signUp({email,password,options:{data:{display_name:name}}});
    if(error){toast(error.message,true);return}toast("회원가입 완료. 이메일 인증 설정을 확인하세요.");closeModal("authModal");
  }else{
    const {error}=await db.auth.signInWithPassword({email,password});if(error){toast(error.message,true);return}closeModal("authModal");toast("로그인되었습니다.");
  }
}
function switchAuth(mode){
  document.querySelectorAll(".auth-tab").forEach(x=>x.classList.toggle("active",x.dataset.auth===mode));
  $("nameField").classList.toggle("hidden",mode!=="signup");$("authSubmit").textContent=mode==="signup"?"회원가입":"로그인";$("authSubmit").dataset.mode=mode;
}

document.addEventListener("DOMContentLoaded",async()=>{
  $("loginBtn").onclick=()=>{switchAuth("login");openModal("authModal")};$("signupBtn").onclick=()=>{switchAuth("signup");openModal("authModal")};$("logoutBtn").onclick=async()=>{await db.auth.signOut();toast("로그아웃되었습니다.")};
  document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
  document.querySelectorAll(".auth-tab").forEach(b=>b.onclick=()=>switchAuth(b.dataset.auth));
  $("authForm").onsubmit=authSubmit;$("eventForm").onsubmit=saveEvent;$("postForm").onsubmit=savePost;
  $("newEventBtn").onclick=()=>{if(!requireAuth())return;if(!isAdmin()){toast("정기모임 등록은 관리자 권한이 필요합니다.",true);return}$("eventForm").reset();$("eventId").value="";$("eventType").value="regular";$("eventModalTitle").textContent="정기모임 등록";openModal("eventModal")};
  $("newSmallEventBtn").onclick=()=>{if(!requireAuth())return;$("eventForm").reset();$("eventId").value="";$("eventType").value="small";$("eventModalTitle").textContent="소모임 등록";openModal("eventModal")};
  $("newPostBtn").onclick=()=>{if(!requireAuth())return;$("postForm").reset();$("postId").value="";$("postModalTitle").textContent="게시글 작성";openModal("postModal")};
  document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));t.classList.add("active");currentBoard=t.dataset.board;loadPosts()});
  $("boardSearch").addEventListener("input",()=>loadPosts());

  const {data}=await db.auth.getSession();session=data.session;await loadProfile();updateAuthUI();await loadEvents();await loadPosts();
  db.auth.onAuthStateChange(async(_event,newSession)=>{session=newSession;await loadProfile();updateAuthUI();});
});
