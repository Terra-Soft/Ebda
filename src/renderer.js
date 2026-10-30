const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let apps = [];
let activeFilter = 'الكل';
let toastTimer;
const titles = {home:'الرئيسية',library:'مكتبة البرامج',updates:'التحديثات',sources:'مصادر البرامج'};
function esc(value='') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toast(message) { const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),3700); }
function iconPath(id) { return `../assets/icons/${id}.svg`; }
function linked(app) { return Boolean(app.repo && app.repo.trim()); }
function card(app) {
 const isLinked = linked(app);
 return `<article class="app-card ${isLinked?'':'empty-repo'}" style="--card-accent:${app.color}">
  <div class="app-card-top"><img class="app-icon" src="${iconPath(app.id)}" alt=""><div><div class="app-card-name">${esc(app.name)}</div><div class="app-card-english">${esc(app.english)}</div></div><span class="app-category">${esc(app.category)}</span></div>
  <p>${esc(app.description)}</p>
  <div class="card-bottom"><span class="repo-state ${isLinked?'linked':''}"><i></i>${isLinked?'مستودع مرتبط':'بانتظار ربط المستودع'}</span><div class="card-actions"><button class="folder-action" data-action="folder" data-id="${esc(app.id)}" title="فتح مجلد التنزيلات">مجلد</button><button class="open-release" data-action="release" data-id="${esc(app.id)}">${isLinked?'عرض الإصدار':'تفاصيل البرنامج'}</button></div></div>
 </article>`;
}
function render() {
 const query = ($('#searchInput')?.value || '').trim().toLocaleLowerCase();
 const matches = app => !query || `${app.name} ${app.english} ${app.category} ${app.description}`.toLocaleLowerCase().includes(query);
 const visible = apps.filter(matches);
 $('#homeGrid').innerHTML = visible.slice(0,4).map(card).join('') || '<div class="empty-state">لا توجد نتائج مطابقة.</div>';
 const libraryItems = visible.filter(app => activeFilter==='الكل' || app.category===activeFilter);
 $('#libraryGrid').innerHTML = libraryItems.map(card).join('') || '<div class="empty-state">لا توجد برامج في هذا التصنيف.</div>';
 $('#libraryCount').textContent = String(libraryItems.length).padStart(2,'0');
 $('#linkedCount').textContent = apps.filter(linked).length;
 $('#sourceList').innerHTML = apps.map(app => `<div class="source-card"><img src="${iconPath(app.id)}" alt=""><div><strong>${esc(app.name)} <span style="color:#758199;font:8px 'IBM Plex Mono',monospace">${esc(app.english)}</span></strong><small>${esc(app.category)} · ${linked(app)?'مستودع محدد':'لم يتم تحديد مستودع'}</small></div><code>${linked(app)?esc(app.repo):'repo: ""  // أضف owner/repo'}</code></div>`).join('');
}
function showPage(page) {
 for (const key of Object.keys(titles)) $(`#${key}Page`).classList.toggle('hidden',key!==page);
 $$('.nav-item').forEach(button=>button.classList.toggle('active',button.dataset.page===page));
 $('#breadcrumbCurrent').textContent=titles[page]||titles.home;
 $('#searchInput').value='';
 render();
}
function sizeText(bytes) {
 if (!bytes) return 'حجم غير معروف';
 const units=['B','KB','MB','GB']; let n=bytes,i=0;
 while(n>=1024 && i<3){n/=1024;i++}
 return `${n.toFixed(i?1:0)} ${units[i]}`;
}
function openModal(app) {
 $('#modalContent').innerHTML = `<div class="modal-app-head"><img src="${iconPath(app.id)}" alt=""><div><h2>${esc(app.name)}</h2><p>${esc(app.description)}</p></div></div><div id="releaseContent" class="empty-state" style="margin-top:15px">${linked(app)?'جارٍ الاتصال بمستودع GitHub…':'لم يتم ربط مستودع بهذا البرنامج. أضف رابطه في src/catalog.js ثم أعد تشغيل المشغّل.'}</div>`;
 $('#modal').classList.remove('hidden');
 if (linked(app)) fetchRelease(app);
}
async function fetchRelease(app) {
 const container=$('#releaseContent');
 try {
  const release=await window.ibdaa.latestRelease(app.id);
  if (!$('#modal').classList.contains('hidden') && container) {
   container.className='';
   container.innerHTML=`<div class="release-meta"><strong>${esc(release.tag||release.name)}</strong><span>${release.publishedAt?new Date(release.publishedAt).toLocaleDateString('ar-EG'):'تاريخ غير متاح'}</span>${release.prerelease?'<span class="release-tag">نسخة تجريبية</span>':''}</div>
    <div class="modal-label">ملاحظات الإصدار</div><div class="release-notes">${esc(release.notes||'لا توجد ملاحظات إصدار مرفقة.')}</div>
    <div class="modal-label">ملفات الإصدار (${release.assets.length})</div><div class="asset-list" id="assetList"></div>
    ${release.assets.length?'':'<div class="no-assets">هذا الإصدار لا يحتوي على ملفات تنزيل مرفقة (Release Assets).</div>'}
    <div class="download-progress"><span id="progressFill"></span></div><div class="download-state" id="downloadState"></div>
    <button class="text-action" id="githubReleasePage">فتح صفحة الإصدار على GitHub ↗</button>`;
   const list=$('#assetList');
   release.assets.forEach(asset=>{
    const button=document.createElement('button');button.className='asset-button';button.textContent=`↓ ${asset.name} · ${sizeText(asset.size)}`;
    button.addEventListener('click',async()=>{
      button.disabled=true;setDownloadState(`بدء تنزيل ${asset.name}…`);
      try{const result=await window.ibdaa.downloadAsset(app.id,asset.url,asset.name);setDownloadState(`اكتمل التنزيل: ${result.filename} · ${sizeText(result.bytes)}`);toast('اكتمل التنزيل.');button.textContent='✓ تم التنزيل';const openBtn=document.createElement('button');openBtn.className='asset-button';openBtn.textContent='فتح الملف بعد مراجعته';openBtn.addEventListener('click',()=>window.ibdaa.openDownloaded(app.id,result.filename));$('#assetList').appendChild(openBtn);}
      catch(error){setDownloadState('تعذر التنزيل: '+error.message);button.disabled=false;}
    });list.appendChild(button);
   });
   $('#githubReleasePage').addEventListener('click',()=>window.ibdaa.openGithub(release.htmlUrl));
  }
 } catch(error) {
  if(container){container.className='empty-state';container.textContent=`تعذر جلب الإصدار: ${error.message}. تأكد من الرابط ووجود Release منشور في المستودع.`;}
 }
}
function setDownloadState(message){const el=$('#downloadState');if(el)el.textContent=message;}
async function checkAllReleases() {
 const list=$('#updatesList');list.innerHTML='';
 const linkedApps=apps.filter(linked);
 if(!linkedApps.length){list.innerHTML='<div class="empty-state">لم يتم تحديد أي مستودعات. عدّل روابط repo في src/catalog.js.</div>';return;}
 $('#checkUpdates').disabled=true;$('#lastCheck').textContent='جارٍ التحقق…';
 for(const app of linkedApps){
  const row=document.createElement('article');row.className='release-row';row.innerHTML=`<div class="release-row-head"><div><h3>${esc(app.name)}</h3><p>جارٍ فحص المستودع…</p></div></div>`;list.appendChild(row);
  try{
   const release=await window.ibdaa.latestRelease(app.id);
   row.innerHTML=`<div class="release-row-head"><div><h3>${esc(app.name)}</h3><p>${esc(release.name)} · ${release.publishedAt?new Date(release.publishedAt).toLocaleDateString('ar-EG'):''}</p></div><span class="release-tag">${esc(release.tag||'Release')}</span></div><div class="asset-list"></div>`;
   const assets=row.querySelector('.asset-list');
   release.assets.forEach(asset=>{
    const btn=document.createElement('button');btn.className='asset-button';btn.textContent=`تنزيل ${asset.name} · ${sizeText(asset.size)}`;
    btn.addEventListener('click',async()=>{btn.disabled=true;try{await window.ibdaa.downloadAsset(app.id,asset.url,asset.name);btn.textContent='✓ تم التنزيل';toast('اكتمل تنزيل '+asset.name)}catch(err){toast(err.message);btn.disabled=false}});
    assets.appendChild(btn);
   });
   if(!release.assets.length)assets.textContent='لا توجد ملفات مرفقة بهذا الإصدار.';
  }catch(error){row.querySelector('p').textContent='تعذر التحقق: '+error.message;}
 }
 $('#lastCheck').textContent=new Date().toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'});
 $('#checkUpdates').disabled=false;
}
document.addEventListener('click',async event=>{
 const nav=event.target.closest('[data-page]');if(nav){showPage(nav.dataset.page);return;}
 const goto=event.target.closest('[data-goto]');if(goto){showPage(goto.dataset.goto);return;}
 const filter=event.target.closest('[data-filter]');if(filter){activeFilter=filter.dataset.filter;$$('.filter-chip').forEach(x=>x.classList.toggle('selected',x===filter));render();return;}
 const windowButton=event.target.closest('[data-window]');if(windowButton){const maximized=await window.ibdaa.windowControl(windowButton.dataset.window);document.body.classList.toggle('maximized',!!maximized);return;}
 const action=event.target.closest('[data-action]');if(action&&action.dataset.action==='release'){const app=apps.find(x=>x.id===action.dataset.id);if(app)openModal(app);return;}if(action&&action.dataset.action==='folder'){window.ibdaa.openFolder(action.dataset.id).then(result=>{if(result)toast(result)}).catch(error=>toast(error.message));return;}
 if(event.target.closest('[data-close-modal]'))$('#modal').classList.add('hidden');
});
$('#browseButton').addEventListener('click',()=>showPage('library'));
$('#reloadButton').addEventListener('click',async()=>{await loadCatalog();toast('تم تحديث مكتبة البرامج من الكود المحلي.');});
$('#searchInput').addEventListener('input',render);
$('#checkUpdates').addEventListener('click',checkAllReleases);
$('#modal').addEventListener('click',event=>{if(event.target.id==='modal')$('#modal').classList.add('hidden')});
window.ibdaa.onProgress(({appId,percent,received,total,filename})=>{
 if(percent!==null){const fill=$('#progressFill');if(fill)fill.style.width=percent+'%';setDownloadState(`جارٍ تنزيل ${filename}: ${percent}% · ${sizeText(received)} / ${sizeText(total)}`);}
 else setDownloadState(`جارٍ تنزيل ${filename} · ${sizeText(received)}`);
});
window.ibdaa.onMaximized(value=>document.body.classList.toggle('maximized',value));
async function loadCatalog(){apps=await window.ibdaa.listCatalog();render();}
loadCatalog().catch(error=>toast('تعذر تحميل مكتبة البرامج: '+error.message));
