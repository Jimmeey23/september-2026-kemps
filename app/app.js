(() => {
  'use strict';
  const REPORTS = [
    {id:'09', title:'Complete Studio Overview', short:'Studio overview', type:'EXECUTIVE OVERVIEW', subtitle:'One studio. Nine lenses. A clear view of what to do next.', file:'09_Complete_Studio_Overview_Kwality_House_September_2026.html'},
    {id:'10', title:'Consolidated Action Plan', short:'Action plan', type:'DECISION & ACTION PLAN', subtitle:'From September’s growth stall to a sequenced, measurable recovery.', file:'10_Kwality_House_Consolidated_Action_Plan_September_2026.html'},
    {id:'01', title:'Sales & Revenue Performance', short:'Sales & revenue', type:'REVENUE INTELLIGENCE', subtitle:'A record month, a shrinking base, and the arithmetic that separates the two.', file:'01_Sales_and_Revenue_Performance_Kwality_House_September_2026.html'},
    {id:'02', title:'Class Performance & Schedule Intelligence', short:'Class performance', type:'DEMAND & SCHEDULE', subtitle:'Class-level performance, capacity signals and an evidence-led roster.', file:'02_Kwality_House_Class_Performance_September_2026.html'},
    {id:'03', title:'Recurring Class Analysis', short:'Recurring classes', type:'HABIT & RETENTION', subtitle:'Which recurring classes are building a habit — and which are quietly fading.', file:'03_Kwality_House_Recurring_Class_Analysis_September_2026.html'},
    {id:'04', title:'Roster Impact & Instructor Changes', short:'Roster impact', type:'ROSTER INTELLIGENCE', subtitle:'What changes when an instructor changes — with overlap controls and context.', file:'04_Kwality_House_Roster_Impact_September_2026.html'},
    {id:'06', title:'Instructor Performance & Scorecards', short:'Instructor performance', type:'PEOPLE & PERFORMANCE', subtitle:'Instructor scorecards, allocation signals and schedule-adjusted context.', file:'06_Kwality_House_Instructor_Performance_September_2026.html'},
    {id:'07', title:'Membership Renewal & Churn Performance', short:'Renewal & churn', type:'MEMBERSHIP HEALTH', subtitle:'The renewal pipeline, churn signals and the behavioural drivers behind them.', file:'07_Membership_Renewal_and_Churn_Performance_Kwality_House_September_2026.html'},
    {id:'08', title:'Late Cancellations & Booking Behaviour', short:'Booking behaviour', type:'BOOKING & LEAKAGE', subtitle:'Where late cancellations, no-shows and booking habits are costing capacity.', file:'08_Late_Cancellations_and_Booking_Behaviour_Kwality_House_September_2026.html'}
  ];
  const $ = id => document.getElementById(id);
  const frame = $('reportFrame');
  const channel = ('BroadcastChannel' in window) ? new BroadcastChannel('kwality-house-live') : null;
  let activeReport = REPORTS.find(r => r.id === localStorage.getItem('kh_current_report')) || REPORTS[0];
  let activeHeadings = [];
  let frameReady = false;
  let pendingSectionId = null;
  let searchIndex = [];
  let indexReady = false;
  let searchMatches = [];
  let selectedSearchIndex = 0;
  let drawerPanel = '';
  let selectedQuote = '';
  let selectedRange = null;
  let selectedColor = 'gold';
  let editingAnnotationId = null;
  let followPresenter = localStorage.getItem('kh_follow_presenter') === 'true';
  let presenterConnected = false;
  let presenterWindow = null;
  let scrollFrameRequest = 0;
  let teleprompterInterval = null;
  let teleprompterPaused = true;
  let readerScale = Number(localStorage.getItem('kh_reader_scale') || 1);
  let timerSeconds = 0;
  let timerInterval = null;
  let timerRunning = false;
  let soundContext = null;
  const agentHistory = [];
  const REPORT_ORDER = REPORTS.map(r => r.id);

  function icon(name){ return `<svg aria-hidden="true"><use href="#i-${name}"></use></svg>`; }
  function esc(value){ return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function readJSON(key, fallback){ try { const val=localStorage.getItem(key); return val ? JSON.parse(val) : fallback; } catch(_){ return fallback; } }
  function writeJSON(key, value){ try { localStorage.setItem(key, JSON.stringify(value)); } catch(_){ toast('Could not save in this browser. Check storage settings.', 'error'); } }
  function annotationsFor(id=activeReport.id){ return readJSON(`kh_annotations_${id}`, []); }
  function notesFor(id=activeReport.id){ return localStorage.getItem(`kh_speaker_notes_${id}`) || ''; }
  function scriptFor(id=activeReport.id){ return localStorage.getItem(`kh_teleprompter_${id}`) || ''; }
  function stickiesFor(id=activeReport.id){ return readJSON(`kh_stickies_${id}`, []); }
  function savedReports(){ return readJSON('kh_bookmarks', []); }
  function reportById(id){ return REPORTS.find(r => r.id === id) || REPORTS[0]; }

  function toast(message, kind='ok'){
    const node=document.createElement('div'); node.className=`toast${kind==='error'?' error':''}`;
    node.innerHTML=`${icon(kind==='error'?'close':'check')}<span>${esc(message)}</span>`;
    $('toastStack').appendChild(node); setTimeout(()=>{ node.style.opacity='0'; node.style.transform='translateY(5px)'; setTimeout(()=>node.remove(),220); },2800);
  }
  function setDrawerMeta(title, eyebrow='PRESENTER TOOLS'){
    $('drawerTitle').textContent=title; $('drawerEyebrow').textContent=eyebrow;
  }
  function openDrawer(panel){
    drawerPanel=panel; renderDrawer(panel); $('drawer').classList.add('open'); $('drawer').setAttribute('aria-hidden','false'); $('drawerScrim').classList.add('open');
    document.body.classList.add('drawer-open');
  }
  function closeDrawer(){ $('drawer').classList.remove('open'); $('drawer').setAttribute('aria-hidden','true'); $('drawerScrim').classList.remove('open'); document.body.classList.remove('drawer-open'); drawerPanel=''; }
  function openModal(modal){
    modal.classList.add('open'); modal.setAttribute('aria-hidden','false'); $('modalScrim').classList.add('open');
  }
  function closeModal(modal){
    if(!modal)return;if(modal.id==='annotationModal')editingAnnotationId=null;modal.classList.remove('open');modal.setAttribute('aria-hidden','true');
    if(!document.querySelector('.modal.open')) $('modalScrim').classList.remove('open');
  }
  function openSearch(initial=''){
    openModal($('searchModal')); $('searchInput').value=initial; renderSearch(initial); setTimeout(()=>$('searchInput').focus(),80);
  }
  function closeSearch(){closeModal($('searchModal'));}

  function updateReportChrome(){
    const r=activeReport;
    $('breadcrumbTitle').textContent=r.short;
    $('reportTitle').textContent=r.title;
    $('reportSub').textContent=r.subtitle;
    $('reportType').textContent=r.type;
    $('readerMeta').textContent=`Reading view · ${r.id}`;
    $('footerReportNumber').textContent=r.id;
    document.title=`${r.title} · Kwality House Intelligence`;
    document.querySelectorAll('.nav-item[data-report]').forEach(btn=>btn.classList.toggle('active',btn.dataset.report===r.id));
    const bookmarked=savedReports().includes(r.id);
    $('bookmarkBtn').classList.toggle('saved',bookmarked);
    $('bookmarkBtn').innerHTML=`${icon('bookmark')}<span>${bookmarked?'Saved':'Save'}</span>`;
    const n=annotationsFor().length; $('annotationCount').textContent=n;
    $('stickyCount').textContent=stickiesFor().length;
    if(drawerPanel) renderDrawer(drawerPanel);
  }
  function setLoading(on){ $('frameLoading').classList.toggle('hidden',!on); frame.classList.toggle('is-ready',!on); }
  function loadReport(id, sectionId=null){
    const report=reportById(id);
    if(sectionId) pendingSectionId=sectionId;
    if(activeReport.id===report.id && frameReady && frame.dataset.reportId===report.id){
      if(sectionId) scrollToSection(sectionId);
      else { scrollToTop(); }
      updateReportChrome(); syncStateToPresenter();
      return;
    }
    activeReport=report; frameReady=false; activeHeadings=[]; localStorage.setItem('kh_current_report',report.id);
    frame.dataset.reportId=report.id; updateReportChrome(); setLoading(true); $('activeSection').textContent='Opening report'; $('progressFill').style.width='0%'; $('readingPercent').textContent='0% read';
    const oldSrc=frame.src; const next=new URL(`reports/${report.file}`,location.href).href;
    if(oldSrc===next){frame.src='about:blank'; setTimeout(()=>{frame.src=next;},30);} else frame.src=next;
  }
  function readerOverrides(){
    const d=frame.contentDocument; if(!d)return;
    let style=d.getElementById('kh-reader-overrides'); if(!style){style=d.createElement('style');style.id='kh-reader-overrides';d.head.appendChild(style);}
    style.textContent=`html{scroll-behavior:smooth;background:#f7f5f1}body{background:#f7f5f1!important}.wrap{max-width:1180px!important;padding-left:clamp(20px,4vw,48px)!important;padding-right:clamp(20px,4vw,48px)!important}.cover{padding-top:52px!important;border-radius:0 0 14px 14px}.cover:after{pointer-events:none}section{scroll-margin-top:22px}h2{scroll-margin-top:22px}.app-highlight{border-radius:3px;padding:0 1px;box-decoration-break:clone;-webkit-box-decoration-break:clone;cursor:pointer}.app-highlight.gold{background:#f7e4bc!important;box-shadow:0 0 0 1px rgba(197,157,93,.08)}.app-highlight.mint{background:#dcefe3!important}.app-highlight.rose{background:#f7dfdb!important}.app-highlight:hover{filter:saturate(1.2)}table{scroll-margin-top:20px}@media(max-width:720px){.wrap{padding-left:18px!important;padding-right:18px!important}.cover h1{font-size:34px!important}.cover .meta div{padding-right:18px!important;margin-right:18px!important}}`;
    d.body.style.zoom=String(readerScale);
  }
  function cleanText(node){
    const clone=node.cloneNode(true); clone.querySelectorAll('svg,style,script').forEach(x=>x.remove());
    return (clone.textContent||'').replace(/\s+/g,' ').trim();
  }
  function enhanceFrame(){
    const d=frame.contentDocument; if(!d||!d.body)return;
    frameReady=true; readerOverrides();
    activeHeadings=[...d.querySelectorAll('h2')].filter(h=>h.textContent.trim()).map((h,i)=>{
      let section=h.closest('section');
      let sid=(section&&section.id)||h.id;
      if(!sid){sid=`kh-section-${i+1}`;h.id=sid;}
      const clone=(section||h.parentElement||h).cloneNode(true); clone.querySelectorAll('svg,style,script').forEach(n=>n.remove());
      return {id:sid,title:h.textContent.replace(/\s+/g,' ').trim(),element:h,section:section||h,text:(clone.textContent||'').replace(/\s+/g,' ').trim(),index:i};
    });
    d.addEventListener('mouseup',()=>setTimeout(showSelectionTools,35));
    d.addEventListener('keyup',()=>setTimeout(showSelectionTools,35));
    d.addEventListener('click',e=>{
      const mark=e.target.closest('[data-annotation-id]'); if(mark){const a=annotationsFor().find(x=>x.id===mark.dataset.annotationId); if(a){openDrawer('annotations');setTimeout(()=>{const card=document.querySelector(`[data-annotation-card="${a.id}"]`);card?.scrollIntoView({block:'center',behavior:'smooth'});},100);}}
    });
    frame.contentWindow.addEventListener('scroll',onFrameScroll,{passive:true});
    applyStoredAnnotations(); buildOutline(); setLoading(false);
    const words=(d.body.innerText||d.body.textContent||'').trim().split(/\s+/).filter(Boolean).length;
    $('readTime').textContent=`~${Math.max(1,Math.ceil(words/220))} min`;
    if(pendingSectionId){const destination=pendingSectionId;pendingSectionId=null;setTimeout(()=>scrollToSection(destination),80);}else{setTimeout(()=>scrollToTop(false),40);}
    updateProgress(); syncStateToPresenter(); updateReportChrome();
  }
  function scrollToTop(smooth=true){
    const w=frame.contentWindow;if(!w)return;if(smooth)w.scrollTo({top:0,behavior:'smooth'});else w.scrollTo(0,0);
  }
  function scrollToSection(idOrIndex){
    if(!frameReady)return;
    let item=activeHeadings.find(h=>h.id===idOrIndex);
    if(!item&&typeof idOrIndex==='number')item=activeHeadings[idOrIndex];
    if(!item)item=activeHeadings.find(h=>h.title.toLowerCase().includes(String(idOrIndex).toLowerCase()));
    if(item){item.element.scrollIntoView({behavior:'smooth',block:'start'});setTimeout(updateProgress,200);}
  }
  function onFrameScroll(){
    if(scrollFrameRequest)return;
    scrollFrameRequest=requestAnimationFrame(()=>{scrollFrameRequest=0;updateProgress();syncStateToPresenter();});
  }
  function updateProgress(){
    if(!frameReady)return;
    const d=frame.contentDocument,w=frame.contentWindow;if(!d||!w)return;
    const root=d.scrollingElement||d.documentElement; const max=Math.max(1,root.scrollHeight-w.innerHeight); const y=root.scrollTop;
    const pct=Math.max(0,Math.min(100,Math.round(y/max*100))); $('progressFill').style.width=`${pct}%`; $('readingPercent').textContent=`${pct}% read`;
    let current=null; for(const h of activeHeadings){const rect=h.element.getBoundingClientRect();if(rect.top<=Math.max(75,w.innerHeight*.23))current=h;else break;}
    if(current){$('activeSection').textContent=current.title;document.querySelectorAll('.outline-item').forEach((b,i)=>b.classList.toggle('active',Number(b.dataset.outlineIndex)===current.index));}
  }
  function buildOutline(){
    // Re-render a visible outline panel only; the drawer can be opened at any time.
    if(drawerPanel==='outline')renderDrawer('outline');
  }
  function syncStateToPresenter(){
    if(!channel||!frameReady)return;
    const d=frame.contentDocument,w=frame.contentWindow; if(!d||!w)return;
    const root=d.scrollingElement||d.documentElement, max=Math.max(1,root.scrollHeight-w.innerHeight);
    let h=null; for(const item of activeHeadings){if(item.element.getBoundingClientRect().top<=Math.max(75,w.innerHeight*.23))h=item;else break;}
    channel.postMessage({type:'mainState',reportId:activeReport.id,sectionId:h?.id||activeHeadings[0]?.id||null,sectionIndex:h?.index||0,scrollRatio:Math.max(0,Math.min(1,root.scrollTop/max)),sectionTitle:h?.title||'',follow:followPresenter});
  }
  function updateFollowUI(){
    const btn=$('followBtn');btn.classList.toggle('following',followPresenter);btn.innerHTML=`<span class="follow-dot"></span><span>${followPresenter?'Following presenter':'Follow presenter'}</span>`;
    localStorage.setItem('kh_follow_presenter',String(followPresenter));
  }

  function applyStoredAnnotations(){
    annotationsFor().forEach(a=>highlightFirstMatch(a.quote,a.color||'gold',a.id,a.sectionId));
  }
  function wrapRange(range,color='gold',id=''){
    if(!range||!frameReady)return false;
    const d=frame.contentDocument;const mark=d.createElement('mark');mark.className=`app-highlight ${color}`;if(id)mark.dataset.annotationId=id;
    try{range.surroundContents(mark);}catch(_){try{const frag=range.extractContents();mark.appendChild(frag);range.insertNode(mark);}catch(e){return false;}}
    return true;
  }
  function highlightFirstMatch(quote,color='gold',id='',sectionId=null){
    if(!quote||!frameReady)return false;
    const d=frame.contentDocument, root=(sectionId&&d.getElementById(sectionId))||d.querySelector('.wrap')||d.body;
    const walker=d.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node){
      const p=node.parentElement;if(!p||p.closest('script,style,textarea,input,select,[data-annotation-id]'))return NodeFilter.FILTER_REJECT;
      return node.nodeValue.length?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;
    }});
    const segments=[];let node;while((node=walker.nextNode()))segments.push(node);
    let normalized='',positions=[],previousBlock=null,previousNode=null;
    const blockTags=new Set(['P','DIV','LI','TD','TH','H1','H2','H3','H4','DT','DD','BLOCKQUOTE','SECTION','UL','OL']);
    const blockOf=element=>{let cur=element;while(cur&&!blockTags.has(cur.tagName))cur=cur.parentElement;return cur;};
    for(const textNode of segments){
      const value=textNode.nodeValue||'',block=blockOf(textNode.parentElement);
      if(previousNode&&block!==previousBlock&&normalized&&!normalized.endsWith(' ')&&!/^\s/.test(value)){normalized+=' ';positions.push({node:previousNode,offset:previousNode.nodeValue.length});}
      for(let i=0;i<value.length;i++){
        const ch=value[i];
        if(/\s/.test(ch)){if(normalized&&!normalized.endsWith(' ')){normalized+=' ';positions.push({node:textNode,offset:i});}}
        else{normalized+=ch;positions.push({node:textNode,offset:i});}
      }
      previousNode=textNode;previousBlock=block;
    }
    const target=quote.replace(/\s+/g,' ').trim();if(!target)return false;
    let at=normalized.indexOf(target);if(at<0)at=normalized.toLowerCase().indexOf(target.toLowerCase());if(at<0)return false;
    const start=positions[at],end=positions[at+target.length-1];if(!start||!end)return false;
    const range=d.createRange();range.setStart(start.node,start.offset);range.setEnd(end.node,end.offset+1);return wrapRange(range,color,id);
  }
  function showSelectionTools(){
    if(!frameReady)return;
    const sel=frame.contentWindow.getSelection();const text=(sel?.toString()||'').replace(/\s+/g,' ').trim();
    if(text.length<3){hideSelectionTools();return;}
    selectedQuote=text;try{selectedRange=sel.getRangeAt(0).cloneRange();}catch(_){selectedRange=null;}
    const rect=selectedRange?.getBoundingClientRect();if(!rect||(!rect.width&&!rect.height)){hideSelectionTools();return;}
    const ir=frame.getBoundingClientRect(), toolbar=$('selectionToolbar');
    const toolbarWidth=Math.min(370,window.innerWidth-20);const left=Math.max(10,Math.min(window.innerWidth-toolbarWidth-10,ir.left+rect.left+rect.width/2-toolbarWidth/2));
    const top=Math.max(65,ir.top+rect.top-43);
    toolbar.style.left=`${left}px`;toolbar.style.top=`${top}px`;toolbar.classList.add('visible');toolbar.setAttribute('aria-hidden','false');
  }
  function hideSelectionTools(){ $('selectionToolbar').classList.remove('visible');$('selectionToolbar').setAttribute('aria-hidden','true'); }
  async function copyToClipboard(text){
    try{await navigator.clipboard.writeText(text);return true;}catch(_){try{const box=document.createElement('textarea');box.value=text;box.style.position='fixed';box.style.opacity='0';document.body.appendChild(box);box.select();const ok=document.execCommand('copy');box.remove();return ok;}catch(e){return false;}}
  }
  function citationForSelection(){const section=activeHeadings.find(h=>selectedRange&&h.section.contains(selectedRange.startContainer));return `“${selectedQuote}” — ${activeReport.title}, ${section?.title||'September 2026 report'}, Kwality House, September 2026.`;}
  function saveAnnotation(note=$('annotationNote').value){ 
    const category=$('annotationCategory').value;const priority=$('annotationPriority').value;
    const tags=$('annotationTags').value.split(',').map(t=>t.trim()).filter(Boolean).slice(0,8);
    const list=annotationsFor();
    if(editingAnnotationId){
      const existing=list.find(a=>a.id===editingAnnotationId);if(!existing)return;
      existing.note=note.trim();existing.color=selectedColor;existing.category=category;existing.priority=priority;existing.tags=tags;existing.updated=new Date().toISOString();
      writeJSON(`kh_annotations_${activeReport.id}`,list);
      if(frameReady){const marks=frame.contentDocument.querySelectorAll(`[data-annotation-id="${CSS.escape(existing.id)}"]`);marks.forEach(m=>m.className=`app-highlight ${selectedColor}`);}
      editingAnnotationId=null;closeModal($('annotationModal'));updateReportChrome();if(drawerPanel==='annotations')renderDrawer('annotations');toast('Annotation updated.');return;
    }
    if(!selectedQuote){toast('Select a passage in the report first.','error');return;}
    const section=activeHeadings.find(h=>selectedRange&&h.section.contains(selectedRange.startContainer));
    const item={id:`ann-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,quote:selectedQuote,note:note.trim(),color:selectedColor,category,priority,tags,sectionId:section?.id||null,created:new Date().toISOString()};
    list.unshift(item);writeJSON(`kh_annotations_${activeReport.id}`,list);
    if(frameReady){let applied=false;try{if(selectedRange&&frame.contentDocument.contains(selectedRange.startContainer))applied=wrapRange(selectedRange.cloneRange(),item.color,item.id);}catch(_){}if(!applied)highlightFirstMatch(item.quote,item.color,item.id,item.sectionId);}
    editingAnnotationId=null;closeModal($('annotationModal'));hideSelectionTools();updateReportChrome();
    if(drawerPanel==='annotations')renderDrawer('annotations');
    toast(note.trim()?'Annotation saved with your note.':'Passage highlighted and saved.');
  }
  function openAnnotationModal(annotation=null){
    editingAnnotationId=annotation?.id||null;
    if(!annotation&&!selectedQuote){toast('Select text in the report to annotate.','error');return;}
    if(annotation)selectedQuote=annotation.quote;
    $('annotationQuote').textContent=selectedQuote;$('annotationNote').value=annotation?.note||'';
    $('annotationCategory').value=annotation?.category||'insight';$('annotationPriority').value=annotation?.priority||'normal';$('annotationTags').value=(annotation?.tags||[]).join(', ');
    selectedColor=annotation?.color||'gold';document.querySelectorAll('.color-dot').forEach(b=>b.classList.toggle('selected',b.dataset.color===selectedColor));
    $('annotationModal').querySelector('h2').textContent=annotation?'Edit annotation':'Capture this insight';
    $('saveAnnotation').innerHTML=`${icon('check')}${annotation?'Save changes':'Save annotation'}`;openModal($('annotationModal'));
  }
  function closeAnnotationModal(){editingAnnotationId=null;closeModal($('annotationModal'));}

  function renderDrawer(panel){
    const body=$('drawerBody');
    if(panel==='outline'){
      setDrawerMeta('On this page','REPORT OUTLINE');
      const list=activeHeadings.length?activeHeadings.map((h,i)=>`<button class="outline-item" data-outline-index="${i}"><span class="outline-num">${String(i+1).padStart(2,'0')}</span><span class="outline-title">${esc(h.title)}</span>${icon('chevron')}</button>`).join(''):`<div class="empty-state"><div class="empty-icon">${icon('book')}</div><b>Preparing outline</b><p>The section map will appear once this report is ready.</p></div>`;
      body.innerHTML=`<p class="drawer-intro">Jump straight to any chapter in <b>${esc(activeReport.short)}</b>. The active section follows your reading position.</p><div class="drawer-label"><span>CHAPTERS</span><span>${String(activeHeadings.length).padStart(2,'0')} SECTIONS</span></div><div class="outline-list">${list}</div><div class="drawer-card"><div class="drawer-card-head"><b>Reading progress</b><span id="outlinePct">${$('readingPercent').textContent}</span></div><div class="progress-track"><div class="progress-fill" style="width:${$('progressFill').style.width||'0%'}"></div></div><p style="margin:8px 0 0;font-size:8px;color:#87939a">Use the outline to navigate while keeping your place in the full report.</p></div>`;
      return;
    }
    if(panel==='notes'){
      setDrawerMeta('Speaker notes','SPEAKER TOOLKIT');
      body.innerHTML=`<p class="drawer-intro">Private notes for <b>${esc(activeReport.short)}</b>. Notes are saved in this browser and can be exported with your annotations.</p><div class="drawer-card"><div class="drawer-card-head"><b>Briefing notes</b><span>PRIVATE</span></div><textarea class="speaker-note" id="speakerNotes" placeholder="Opening thought, transitions, questions to ask, or key points to land…">${esc(notesFor())}</textarea><div class="autosave"><span>Only visible in your speaker view</span><span class="saved-state" id="noteSaved">${icon('check')}Saved locally</span></div></div><div class="tool-card"><div class="tool-card-title"><span class="tool-card-icon">${icon('mic')}</span><span><b>Live teleprompter</b><small>Keep your delivery calm and on pace</small></span></div><p>Add or paste your spoken script, then launch the on-screen reader. The script is kept separate from private notes.</p><button class="drawer-btn" data-drawer-action="open-toolkit">Open speaker toolkit ${icon('arrow-right')}</button></div>`;
      bindSpeakerNotes();return;
    }
    if(panel==='toolkit'){
      setDrawerMeta('Speaker toolkit','PRESENTATION CONTROLS');
      body.innerHTML=`<p class="drawer-intro">Your presenter desk for this briefing. Speaker notes stay private; the teleprompter can be shown over the report viewport.</p>
        <div class="drawer-card"><div class="drawer-card-head"><b>Speaker notes</b><span>PRIVATE · AUTOSAVED</span></div><textarea class="speaker-note" id="speakerNotes" placeholder="Key points, transitions, and questions…">${esc(notesFor())}</textarea><div class="autosave"><span>Synced in this browser</span><span class="saved-state" id="noteSaved">${icon('check')}Saved locally</span></div></div>
        <div class="drawer-label"><span>LIVE TELEPROMPTER</span><span>LOCAL SCRIPT</span></div><div class="inline-field"><label for="teleprompterScript">SCRIPT TO READ</label><textarea class="script-area" id="teleprompterScript" placeholder="Paste your presenter script here…">${esc(scriptFor())}</textarea></div>
        <div class="inline-field"><label>SCROLL SPEED</label><div class="range-line"><input id="scriptSpeed" type="range" min="1" max="8" value="3"><span id="scriptSpeedReadout">3×</span></div></div>
        <div class="tool-inline"><button class="drawer-btn" data-drawer-action="show-teleprompter">${icon('play')} Start teleprompter</button><button class="drawer-btn" data-drawer-action="use-notes-script">Use speaker notes</button></div>
        <div class="drawer-label"><span>SESSION TIMER</span><span>ELAPSED</span></div><div class="drawer-card"><div class="drawer-card-head"><b>Presentation timer</b><span>UP-COUNT</span></div><div class="timer-display" id="timerDisplay">${formatTime(timerSeconds)}</div><div class="timer-controls"><button id="timerToggle">${timerRunning?'Pause':'Start'} timer</button><button id="timerReset">Reset</button></div></div>
        <div class="drawer-label"><span>PRESENTER VIEW</span><span>SECOND SCREEN</span></div><div class="tool-card"><div class="tool-card-title"><span class="tool-card-icon">${icon('presentation')}</span><span><b>Open speaker view</b><small>Notes, timer, section navigator &amp; audience follow</small></span></div><p>A separate presenter window stays in sync with the report viewport. Use it on a second screen or keep it beside your slides.</p><button class="drawer-btn primary" data-drawer-action="present">${icon('presentation')} Open presenter view ${icon('arrow-up-right')}</button></div>
        <div class="drawer-card"><div class="drawer-card-head"><b>Follow presenter</b><span id="followStatusText">${followPresenter?'ON':'OFF'}</span></div><p style="margin:0 0 8px;font-size:8px;color:#829099">When enabled, this report follows section changes from the presenter window.</p><button class="drawer-btn" data-drawer-action="toggle-follow">${followPresenter?'Stop following':'Follow presenter'}</button></div>`;
      bindSpeakerNotes();bindToolkit();return;
    }
    if(panel==='annotations'){
      const items=annotationsFor();setDrawerMeta('Annotations','REVIEW & MARKUP');
      const content=items.length?`<div class="annotation-list">${items.map(a=>`<article class="annotation-card" data-annotation-card="${esc(a.id)}" data-category="${esc(a.category||'insight')}"><div class="annotation-card-head"><span class="annotation-kind kind-${esc(a.category||'insight')}">${esc((a.category||'insight').toUpperCase())}</span><span class="annotation-card-meta">${a.priority==='high'?'<i class="priority-mark"></i> HIGH · ':''}${esc((a.color||'gold').toUpperCase())} · ${new Date(a.created).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span></div><blockquote>${esc(a.quote)}</blockquote>${a.note?`<p>${esc(a.note)}</p>`:''}${a.tags?.length?`<div class="annotation-tags">${a.tags.map(t=>`<span>${esc(t)}</span>`).join('')}</div>`:''}<div class="annotation-card-actions"><button data-jump-annotation="${esc(a.id)}">Find</button><button data-edit-annotation="${esc(a.id)}">Edit</button><button data-delete-annotation="${esc(a.id)}">Remove</button></div></article>`).join('')}</div>`:`<div class="empty-state"><div class="empty-icon">${icon('note')}</div><b>Your margin, made yours</b><p>Select a passage in the report to highlight, classify, tag and revisit it later.</p><button data-drawer-action="annotation-help">How to annotate</button></div>`;
      body.innerHTML=`<p class="drawer-intro">Build a useful review layer with colour-coded highlights, action/question/risk labels and searchable tags. Marks are saved per report in this browser.</p><div class="annotation-toolbar"><label class="annotation-search"><svg><use href="#i-search"/></svg><input id="annotationSearch" placeholder="Find a note, quote or tag…"></label><select id="annotationFilter" aria-label="Filter annotations"><option value="all">All types</option><option value="insight">Insights</option><option value="action">Actions</option><option value="question">Questions</option><option value="risk">Risks</option></select></div><button class="drawer-btn" data-drawer-action="export">${icon('download')} Export notes &amp; annotations</button><div class="drawer-label"><span>THIS REPORT</span><span id="annotationTotal">${items.length} ${items.length===1?'MARK':'MARKS'}</span></div>${content}`;
      const applyFilters=()=>{const q=($('annotationSearch').value||'').trim().toLowerCase(),category=$('annotationFilter').value;let visible=0;body.querySelectorAll('.annotation-card').forEach(card=>{const matchesCategory=category==='all'||card.dataset.category===category;const matchesText=!q||card.textContent.toLowerCase().includes(q);const show=matchesCategory&&matchesText;card.hidden=!show;if(show)visible++;});const total=$('annotationTotal');if(total)total.textContent=`${visible} ${visible===1?'MARK':'MARKS'}`;};
      $('annotationSearch').addEventListener('input',applyFilters);$('annotationFilter').addEventListener('change',applyFilters);return;
    }
    if(panel==='sticky'){
      const items=stickiesFor();setDrawerMeta('Sticky notes','PERSISTENT NOTES');
      body.innerHTML=`<p class="drawer-intro">Small reminders tied to <b>${esc(activeReport.short)}</b>. Your notes persist in this browser, even after you close the briefing.</p><button class="sticky-add" data-drawer-action="new-sticky">${icon('plus')} Add a sticky note</button>${items.length?`<div class="sticky-list">${items.map(s=>`<article class="sticky-item ${esc(s.color||'')}" data-sticky-card="${esc(s.id)}"><span class="sticky-pin"></span><div class="sticky-context">${esc(s.sectionTitle||activeReport.short)}</div><textarea data-sticky-input="${esc(s.id)}" placeholder="Write a thought…">${esc(s.text)}</textarea><div class="sticky-item-foot"><span>${new Date(s.created).toLocaleDateString('en-IN',{day:'numeric',month:'short'})} · saved locally</span><button data-delete-sticky="${esc(s.id)}">Remove</button></div></article>`).join('')}</div>`:`<div class="empty-state"><div class="empty-icon">${icon('sticky')}</div><b>No stickies yet</b><p>Keep an action, question, or point to revisit close to this report.</p></div>`}`;
      body.querySelectorAll('[data-sticky-input]').forEach(t=>t.addEventListener('input',()=>updateSticky(t.dataset.stickyInput,t.value)));
      return;
    }
    if(panel==='assistant'){
      setDrawerMeta('Insight agent','REPORT-GROUNDED · LOCAL');
      const conversation=agentHistory.map((m,i)=>m.role==='user'?`<div class="agent-message user"><div class="agent-message-label">YOU</div><p>${esc(m.text)}</p></div>`:`<div class="agent-message"><div class="agent-message-label">INSIGHT AGENT · EVIDENCE SEARCH</div><p>${esc(m.answer)}</p>${m.sources.length?`<div class="agent-evidence">${m.sources.map(s=>`<button data-agent-source="${esc(s.reportId)}" data-agent-section="${esc(s.sectionId||'')}">${icon('book')} ${esc(s.reportTitle)} › ${esc(s.heading)}</button>`).join('')}</div>`:''}</div>`).join('');
      body.innerHTML=`<div class="agent-banner"><div class="agent-banner-top"><span class="agent-orb">${icon('spark')}</span><b>Studio insight agent</b><span class="agent-online"><i></i>READY</span></div><p>Ask about the September reports. I search the full report library locally and return source-linked evidence — your data stays in this browser.</p></div><div class="source-chip">${icon('book')} ${indexReady?'9 reports indexed':'Building report index…'} <span>·</span> private to this session</div>${agentHistory.length?`<div class="agent-chat">${conversation}</div>`:`<div class="drawer-label"><span>TRY ASKING</span><span>QUICK PROMPTS</span></div><div class="prompt-chips"><button class="prompt-chip" data-prompt="Why is the revenue headline misleading when attendance is falling?">Why is the revenue headline misleading when attendance is falling?</button><button class="prompt-chip" data-prompt="Where is the studio capacity constrained, and what should we add?">Where is capacity constrained, and what should we add?</button><button class="prompt-chip" data-prompt="What is the clearest retention risk for October?">What is the clearest retention risk for October?</button><button class="prompt-chip" data-prompt="What should leadership do in the next two weeks?">What should leadership do in the next two weeks?</button></div>`}<form class="agent-input-row" id="agentForm"><input id="agentInput" placeholder="Ask for an insight or compare signals…" autocomplete="off"><button class="agent-send" aria-label="Ask insight agent">${icon('arrow-right')}</button></form>`;
      $('agentForm').addEventListener('submit',e=>{e.preventDefault();const input=$('agentInput');const q=input.value.trim();if(q)askAgent(q);});
      body.querySelectorAll('[data-prompt]').forEach(b=>b.addEventListener('click',()=>askAgent(b.dataset.prompt)));
      body.querySelectorAll('[data-agent-source]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.agentSource,section=b.dataset.agentSection;closeDrawer();loadReport(id,section||null);}));
      setTimeout(()=>{const c=body.querySelector('.agent-chat');if(c)c.scrollTop=c.scrollHeight;},20);return;
    }
    if(panel==='soundboard'){
      setDrawerMeta('Soundboard','SFX · USER-TRIGGERED');
      body.innerHTML=`<p class="drawer-intro">Small, optional cues for transitions and live briefings. Sounds are synthesized in your browser and play only when you press a button.</p><div class="drawer-label"><span>QUICK CUES</span><span>CLICK TO PLAY</span></div><div class="sound-grid"><button class="sound-card" data-sfx="chime"><span class="sound-icon">${icon('spark')}</span><b>Opening chime</b><small>Warm 3-note cue</small><span class="sound-play">PLAY</span></button><button class="sound-card" data-sfx="transition"><span class="sound-icon">${icon('arrow-right')}</span><b>Section shift</b><small>Soft transition whoosh</small><span class="sound-play">PLAY</span></button><button class="sound-card" data-sfx="applause"><span class="sound-icon">${icon('users')}</span><b>Applause</b><small>Short audience swell</small><span class="sound-play">PLAY</span></button><button class="sound-card" data-sfx="focus"><span class="sound-icon">${icon('target')}</span><b>Focus bell</b><small>Quiet attention cue</small><span class="sound-play">PLAY</span></button></div><div class="drawer-label"><span>VOLUME</span><span id="volumeLabel">${Math.round(Number(localStorage.getItem('kh_sfx_volume')||.55)*100)}%</span></div><div class="sound-volume"><span>QUIET</span><input id="soundVolume" type="range" min="0" max="100" value="${Math.round(Number(localStorage.getItem('kh_sfx_volume')||.55)*100)}"><span>FULL</span></div><div class="drawer-card"><p style="margin:0;font-size:8px;color:#89959b;line-height:1.6">Sound effects are generated with the Web Audio API. No audio files or external services are used.</p></div>`;
      body.querySelectorAll('[data-sfx]').forEach(b=>b.addEventListener('click',()=>playSfx(b.dataset.sfx)));
      const vol=$('soundVolume');vol?.addEventListener('input',()=>{localStorage.setItem('kh_sfx_volume',String(Number(vol.value)/100));$('volumeLabel').textContent=`${vol.value}%`;const quick=$('floatingSoundVolume');quick.value=vol.value;$('floatingVolumeLabel').textContent=`${vol.value}%`;});return;
    }
  }
  function bindSpeakerNotes(){
    const box=$('speakerNotes');if(!box)return;
    box.addEventListener('input',()=>{localStorage.setItem(`kh_speaker_notes_${activeReport.id}`,box.value);const label=$('noteSaved');if(label)label.innerHTML=`${icon('check')}Saved locally`;});
  }
  function bindToolkit(){
    const script=$('teleprompterScript'),speed=$('scriptSpeed');
    if(script)script.addEventListener('input',()=>localStorage.setItem(`kh_teleprompter_${activeReport.id}`,script.value));
    if(speed)speed.addEventListener('input',()=>{$('scriptSpeedReadout').textContent=`${speed.value}×`; $('tpSpeed').value=speed.value; $('tpSpeedLabel').textContent=`${speed.value}×`;});
    $('timerToggle')?.addEventListener('click',toggleTimer);$('timerReset')?.addEventListener('click',resetTimer);
  }
  function renderAnnotations(){ if(drawerPanel==='annotations')renderDrawer('annotations'); }
  function updateSticky(id,text){const arr=stickiesFor();const item=arr.find(s=>s.id===id);if(item){item.text=text;item.updated=new Date().toISOString();writeJSON(`kh_stickies_${activeReport.id}`,arr);}}
  function formatTime(seconds){const mm=String(Math.floor(seconds/60)).padStart(2,'0'),ss=String(seconds%60).padStart(2,'0');return `${mm}:${ss}`;}
  function updateTimerUI(){const node=$('timerDisplay');if(node)node.textContent=formatTime(timerSeconds);const btn=$('timerToggle');if(btn)btn.textContent=timerRunning?'Pause timer':'Start timer';}
  function toggleTimer(){
    timerRunning=!timerRunning;
    if(timerRunning){timerInterval=setInterval(()=>{timerSeconds++;updateTimerUI();},1000);}else{clearInterval(timerInterval);timerInterval=null;}updateTimerUI();
  }
  function resetTimer(){timerRunning=false;clearInterval(timerInterval);timerInterval=null;timerSeconds=0;updateTimerUI();}
  function openStickyModal(prefill=''){$('stickyInput').value=prefill;$('stickyContext').textContent=`Attached to ${activeReport.short}`;openModal($('stickyModal'));setTimeout(()=>$('stickyInput').focus(),80);}
  function saveSticky(){
    const text=$('stickyInput').value.trim();if(!text){toast('Add a thought before saving your sticky.','error');return;}
    let section=activeHeadings.find(h=>selectedRange&&h.section.contains(selectedRange.startContainer));
    const list=stickiesFor();list.unshift({id:`sticky-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,text,sectionId:section?.id||null,sectionTitle:section?.title||activeReport.short,color:['','mint','rose'][list.length%3],created:new Date().toISOString()});
    writeJSON(`kh_stickies_${activeReport.id}`,list);closeModal($('stickyModal'));updateReportChrome();if(drawerPanel==='sticky')renderDrawer('sticky');toast('Sticky note saved to this report.');
  }
  function deleteSticky(id){const next=stickiesFor().filter(x=>x.id!==id);writeJSON(`kh_stickies_${activeReport.id}`,next);updateReportChrome();renderDrawer('sticky');toast('Sticky note removed.');}
  function scrollToAnnotation(id){
    const item=annotationsFor().find(a=>a.id===id);if(!item)return;
    if(!frameReady){closeDrawer();return;}
    const mark=frame.contentDocument.querySelector(`[data-annotation-id="${CSS.escape(id)}"]`);
    if(mark){closeDrawer();mark.scrollIntoView({behavior:'smooth',block:'center'});mark.classList.add('annotation-target');setTimeout(()=>mark.classList.remove('annotation-target'),1500);return;}
    if(item.sectionId)scrollToSection(item.sectionId);else closeDrawer();
  }
  function deleteAnnotation(id){const next=annotationsFor().filter(x=>x.id!==id);writeJSON(`kh_annotations_${activeReport.id}`,next);const marks=frame.contentDocument?.querySelectorAll(`[data-annotation-id="${CSS.escape(id)}"]`)||[];marks.forEach(m=>{const p=m.parentNode;while(m.firstChild)p.insertBefore(m.firstChild,m);p.removeChild(m);p.normalize();});updateReportChrome();renderDrawer('annotations');toast('Annotation removed.');}

  function buildSearchIndex(){
    const status=$('indexStatus');
    Promise.all(REPORTS.map(async report=>{
      try{
        const res=await fetch(`reports/${report.file}`);if(!res.ok)throw new Error('report');
        const html=await res.text();const parsed=new DOMParser().parseFromString(html,'text/html');
        const sections=[...parsed.querySelectorAll('section')];
        const built=[];
        sections.forEach((section,i)=>{
          const heading=section.querySelector('h2,h1');if(!heading)return;
          const id=section.id||heading.id||`kh-section-${i+1}`;
          const text=cleanText(section);
          if(text.length<25)return;
          built.push({reportId:report.id,reportTitle:report.short,reportName:report.title,sectionId:id,heading:heading.textContent.replace(/\s+/g,' ').trim(),text,index:i});
        });
        if(!built.length)built.push({reportId:report.id,reportTitle:report.short,reportName:report.title,sectionId:'',heading:report.title,text:cleanText(parsed.body),index:0});
        return built;
      }catch(_){return [];}
    })).then(groups=>{
      searchIndex=groups.flat();indexReady=true;
      $('indexStatus').innerHTML='<i></i>9 reports ready';
      if(drawerPanel==='assistant')renderDrawer('assistant');
      if($('searchInput').value)renderSearch($('searchInput').value);
    }).catch(()=>{if(status)status.textContent='Index unavailable';});
  }
  function tokensFor(q){return q.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').match(/[a-z0-9₹]+/g)?.filter(t=>t.length>1)||[];}
  function searchSections(query,limit=16){
    const terms=[...new Set(tokensFor(query))];if(!terms.length)return [];
    const phrase=query.toLowerCase().trim();
    return searchIndex.map(item=>{
      const heading=item.heading.toLowerCase(),title=item.reportName.toLowerCase(),body=item.text.toLowerCase();let score=0,matched=0;
      terms.forEach(t=>{let local=0;if(heading.includes(t))local+=5;if(title.includes(t))local+=2;const count=(body.match(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'))||[]).length;local+=Math.min(count,7);if(local)matched++;score+=local;});
      if(phrase.length>3&&body.includes(phrase))score+=12;
      score=score*(matched/terms.length);
      return {...item,score};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,limit);
  }
  function makeSnippet(text,query){
    const low=text.toLowerCase(),terms=tokensFor(query);let at=-1;
    for(const t of terms){const i=low.indexOf(t);if(i>=0&&(at<0||i<at))at=i;}
    if(at<0)return text.slice(0,190)+(text.length>190?'…':'');
    let start=Math.max(0,at-78),end=Math.min(text.length,at+175);
    if(start>0){const space=text.indexOf(' ',start);if(space>=0&&space<at)start=space+1;}
    if(end<text.length){const space=text.lastIndexOf(' ',end);if(space>at)end=space;}
    return (start?'…':'')+text.slice(start,end)+(end<text.length?'…':'');
  }
  function highlightSnippet(text,query){
    let result=esc(text);const terms=[...new Set(tokensFor(query))].sort((a,b)=>b.length-a.length).slice(0,6);
    terms.forEach(t=>{const safe=t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');result=result.replace(new RegExp(`(${safe})`,'ig'),'<mark>$1</mark>');});return result;
  }
  function renderSearch(query){
    const box=$('searchResults');if(!box)return;
    if(!query.trim()){
      box.innerHTML=`<div class="search-empty"><span class="search-empty-mark">${icon('spark')}</span><b>Explore the briefing library</b><p>Search any phrase, metric, class, or recommendation.</p><div class="search-suggestions"><button data-query="revenue attendance">revenue vs attendance</button><button data-query="Strength Lab capacity">Strength Lab capacity</button><button data-query="renewal churn">renewals &amp; churn</button></div></div>`;
      box.querySelectorAll('[data-query]').forEach(b=>b.addEventListener('click',()=>{$('searchInput').value=b.dataset.query;renderSearch(b.dataset.query);}));return;
    }
    if(!indexReady){box.innerHTML='<div class="search-empty"><span class="search-empty-mark">◌</span><b>Indexing your reports</b><p>Searching the full briefing library locally…</p></div>';return;}
    searchMatches=searchSections(query,18);selectedSearchIndex=0;
    if(!searchMatches.length){box.innerHTML=`<div class="search-empty"><span class="search-empty-mark">${icon('search')}</span><b>No matches yet</b><p>Try a broader phrase, such as “revenue”, “retention”, or “capacity”.</p></div>`;return;}
    box.innerHTML=searchMatches.map((m,i)=>`<button class="search-result ${i===0?'selected':''}" data-search-result="${i}"><span class="result-index">${esc(m.reportId)}</span><span class="result-main"><span class="result-title">${esc(m.heading)} <span>${esc(m.reportTitle)}</span></span><span class="result-snippet">${highlightSnippet(makeSnippet(m.text,query),query)}</span></span><span class="result-tag">${i===0?'OPEN ↵':'SECTION'}</span></button>`).join('');
    box.querySelectorAll('[data-search-result]').forEach(b=>b.addEventListener('click',()=>openSearchResult(Number(b.dataset.searchResult))));
  }
  function openSearchResult(index){const item=searchMatches[index];if(!item)return;closeSearch();loadReport(item.reportId,item.sectionId||null);}
  function moveSearchSelection(delta){if(!searchMatches.length)return;selectedSearchIndex=(selectedSearchIndex+delta+searchMatches.length)%searchMatches.length;document.querySelectorAll('.search-result').forEach((b,i)=>b.classList.toggle('selected',i===selectedSearchIndex));document.querySelector('.search-result.selected')?.scrollIntoView({block:'nearest'});}
  function toggleBookmark(){
    const list=savedReports(),at=list.indexOf(activeReport.id);if(at>=0)list.splice(at,1);else list.unshift(activeReport.id);writeJSON('kh_bookmarks',list);updateReportChrome();toast(at>=0?'Removed from saved reports.':'Report saved to your briefing list.');
  }
  function exportBaseName(){return `kwality-house-${activeReport.id}-${activeReport.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}-sep-2026`;}
  function downloadFile(content,mime,filename){const blob=new Blob([content],{type:mime});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1200);}
  function sourceReportDocument(){return frameReady?frame.contentDocument:null;}
  function buildStandaloneReportHTML(printable=false){
    const source=sourceReportDocument();if(!source)return'';
    const clone=source.documentElement.cloneNode(true);clone.querySelector('#kh-reader-overrides')?.remove();clone.querySelectorAll('script,iframe').forEach(n=>n.remove());
    const body=clone.querySelector('body');if(body)body.style.removeProperty('zoom');
    const title=clone.querySelector('title');if(title)title.textContent=`${activeReport.title} · Kwality House · September 2026`;
    const head=clone.querySelector('head');const exportStyle=source.createElement('style');exportStyle.textContent=`.app-highlight.gold{background:#f7e4bc!important;border-radius:3px;padding:0 1px}.app-highlight.mint{background:#dcefe3!important;border-radius:3px;padding:0 1px}.app-highlight.rose{background:#f7dfdb!important;border-radius:3px;padding:0 1px}`;head.appendChild(exportStyle);
    if(printable){
      exportStyle.textContent+=`@page{size:A4;margin:14mm}@media print{html,body{background:#fff!important}.export-print-toolbar{display:none!important}.cover,.callout,.kpi{print-color-adjust:exact;-webkit-print-color-adjust:exact}.tbl-wrap,table,svg,.card,.ins,.kpi,tr{break-inside:avoid;page-break-inside:avoid}thead{display:table-header-group}a{color:inherit;text-decoration:none}}.export-print-toolbar{position:sticky;top:0;z-index:9999;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 18px;background:#17252d;color:#e8e6df;font:12px Arial,sans-serif;box-shadow:0 3px 16px rgba(0,0,0,.16)}.export-print-toolbar b{color:#e1c28d}.export-print-toolbar button{border:1px solid #d2b276;border-radius:6px;background:#d8b77e;color:#202a2c;padding:8px 12px;font-weight:700;cursor:pointer}`;
      if(body){const bar=source.createElement('div');bar.className='export-print-toolbar';bar.innerHTML='<span><b>KWALITY HOUSE</b> · Print-ready report · September 2026</span><button id="printAgain" type="button">Print / Save as PDF</button>';body.insertBefore(bar,body.firstChild);}
    }
    return `<!doctype html>\n${clone.outerHTML}`;
  }
  function reportMarkdown(doc){
    const out=[`# ${activeReport.title}`,`**Kwality House · Kemps Corner · September 2026**`,''];
    const cover=doc.querySelector('.cover .sub');if(cover)out.push(cover.textContent.trim(),'');
    const meta=doc.querySelector('.cover .meta');if(meta){out.push('**Report details**');[...meta.children].forEach(item=>{const key=item.querySelector('.k')?.textContent.trim(),value=item.querySelector('.v')?.textContent.trim();if(key&&value)out.push(`- **${key}:** ${value}`);});out.push('');}
    const toc=doc.querySelector('.toc');if(toc){out.push('## In this report');[...toc.querySelectorAll('a')].forEach(a=>out.push(`- ${a.textContent.replace(/\s+/g,' ').trim()}`));out.push('');}
    const clean=node=>(node?.innerText||node?.textContent||'').replace(/\s+/g,' ').trim();
    const add=text=>{if(text&&String(text).trim())out.push(String(text).trim(),'');};
    const tableMarkdown=table=>{
      const rows=[...table.querySelectorAll('tr')].map(tr=>[...tr.querySelectorAll('th,td')].map(c=>clean(c).replace(/\|/g,'\\|').replace(/\n/g,' '))).filter(r=>r.length);
      if(!rows.length)return'';const width=Math.max(...rows.map(r=>r.length));const normalized=rows.map(r=>Array.from({length:width},(_,i)=>r[i]||''));
      const headers=normalized[0].map((cell,i)=>cell||`Column ${i+1}`);return[`| ${headers.join(' | ')} |`,`| ${headers.map(()=> '---').join(' | ')} |`,...normalized.slice(1).map(r=>`| ${r.join(' | ')} |`)].join('\n');
    };
    const walk=node=>{
      if(node.nodeType===Node.TEXT_NODE)return;
      if(node.nodeType!==Node.ELEMENT_NODE)return;
      if(node.matches('script,style'))return;
      if(node.matches('h1,h2,h3,h4')){const level=Number(node.tagName[1]);if(!node.closest('.cover'))add(`${'#'.repeat(Math.min(level,6))} ${clean(node)}`);return;}
      if(node.matches('p')){const txt=clean(node);if(txt)add(node.classList.contains('cap')?`_${txt}_`:txt);return;}
      if(node.matches('table')){add(tableMarkdown(node));return;}
      if(node.matches('ul,ol')){[...node.querySelectorAll(':scope > li')].forEach((li,i)=>add(`${node.tagName==='OL'?`${i+1}.`:'-'} ${clean(li)}`));return;}
      if(node.matches('.kpi')){const lab=clean(node.querySelector('.lab')),val=clean(node.querySelector('.val')),note=clean(node.querySelector('.note'));add(`**${lab}: ${val}**${note?`\n${note}`:''}`);return;}
      if(node.matches('.ins')){const title=clean(node.querySelector('.t'));if(title)add(`> **${title}**`);const pairs=[...node.querySelectorAll('dt')].map(dt=>{const dd=dt.nextElementSibling;return dd?`> **${clean(dt)}:** ${clean(dd)}`:`> ${clean(dt)}`;});if(pairs.length)add(pairs.join('\n'));return;}
      if(node.matches('svg')){const labels=clean(node);if(labels)add(`> Chart / graphic labels: ${labels}`);return;}
      if(node.matches('.toc'))return;
      if(node.matches('img')){add(`![${node.alt||'Report image'}](${node.src||''})`);return;}
      const hasStructuredBlocks=node.querySelector('h1,h2,h3,h4,p,table,ul,ol,.kpi,.ins,svg,img');
      if(!hasStructuredBlocks){const text=clean(node);if(text)add(text);return;}
      for(const child of node.children)walk(child);
    };
    [...doc.querySelectorAll('body > section, body > .wrap > section, body section')].filter((el,i,arr)=>!arr.some(other=>other!==el&&other.contains(el))).forEach(section=>walk(section));
    return out.join('\n').replace(/\n{3,}/g,'\n\n').trim()+'\n';
  }
  function structuredReportExport(doc){
    const sections=[...doc.querySelectorAll('section')].map((section,index)=>{
      const heading=section.querySelector('h2,h1');
      return{id:section.id||null,order:index+1,title:heading?.textContent.replace(/\s+/g,' ').trim()||'',text:cleanText(section),tables:[...section.querySelectorAll('table')].map(table=>[...table.querySelectorAll('tr')].map(row=>[...row.querySelectorAll('th,td')].map(cell=>(cell.innerText||cell.textContent||'').replace(/\s+/g,' ').trim()))),chartLabels:[...section.querySelectorAll('svg')].map(svg=>(svg.textContent||'').replace(/\s+/g,' ').trim()).filter(Boolean)};
    });
    return{studio:'Physique 57 · Kwality House, Kemps Corner',period:'1–30 September 2026',reportId:activeReport.id,reportTitle:activeReport.title,subtitle:doc.querySelector('.cover .sub')?.textContent.trim()||activeReport.subtitle,exportedAt:new Date().toISOString(),sections};
  }
  function openPrintExport(){
    const popup=window.open('about:blank','_blank');if(!popup){try{frame.contentWindow.focus();frame.contentWindow.print();toast('Print dialog opened — choose “Save as PDF”.');}catch(_){toast('Allow pop-ups or printing to export this report as PDF.','error');}return;}
    const html=buildStandaloneReportHTML(true);popup.document.open();popup.document.write(html);popup.document.close();
    let launched=false;const launch=()=>{if(launched)return;launched=true;try{popup.document.getElementById('printAgain')?.addEventListener('click',()=>popup.print());popup.focus();popup.print();}catch(_){toast('Use Print / Save as PDF in the new report window.','error');}};
    popup.addEventListener('load',()=>setTimeout(launch,450),{once:true});setTimeout(launch,950);toast('Print view opened — choose “Save as PDF” in the print dialog.');
  }
  function exportEntireReport(format){
    const doc=sourceReportDocument();if(!doc){toast('Wait for the report to finish loading.','error');return;}
    const name=exportBaseName();
    if(format==='pdf'){openPrintExport();return;}
    if(format==='html'){downloadFile(buildStandaloneReportHTML(false),'text/html;charset=utf-8',`${name}.html`);toast('Standalone HTML report downloaded.');return;}
    if(format==='text'){downloadFile((doc.body.innerText||doc.body.textContent||'').replace(/\n{3,}/g,'\n\n').trim()+'\n','text/plain;charset=utf-8',`${name}.txt`);toast('Complete report text downloaded.');return;}
    if(format==='markdown'){downloadFile(reportMarkdown(doc),'text/markdown;charset=utf-8',`${name}.md`);toast('Structured Markdown report downloaded.');return;}
    if(format==='json'){downloadFile(JSON.stringify(structuredReportExport(doc),null,2),'application/json;charset=utf-8',`${name}.json`);toast('Structured report data downloaded.');}
  }
  function toggleReportExportMenu(force){const menu=$('reportExportMenu'),open=typeof force==='boolean'?force:!menu.classList.contains('open');menu.classList.toggle('open',open);menu.setAttribute('aria-hidden',String(!open));$('reportExportBtn').setAttribute('aria-expanded',String(open));}
  function toggleSoundPopover(force){const pop=$('soundFabPopover'),open=typeof force==='boolean'?force:!pop.classList.contains('open');pop.classList.toggle('open',open);pop.setAttribute('aria-hidden',String(!open));$('soundFab').setAttribute('aria-expanded',String(open));}

  function exportNotes(){
    const data={studio:'Kwality House · Kemps Corner',period:'September 2026',exportedAt:new Date().toISOString(),report:{id:activeReport.id,title:activeReport.title},speakerNotes:notesFor(),teleprompterScript:scriptFor(),annotations:annotationsFor(),stickyNotes:stickiesFor()};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`kwality-house-${activeReport.id}-presenter-notes.json`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);toast('Presenter notes exported as JSON.');
  }

  function curatedAnswer(query,results){
    const q=query.toLowerCase();
    if((q.includes('revenue')&&(/attend|visit|cash|paradox|record/.test(q)))||q.includes('headline misleading'))return 'September’s ₹3.206m cash headline is not a clean growth signal. One ₹420k private-session sale contributed 13.1% of collections; excluding it leaves ₹2.786m, down 7.0% month over month. Meanwhile check-ins fell 19.4% to 2,090 and transactions fell to 272—the lowest in the 13-month series. Plan from adjusted collections, not the one-off peak.';
    if(/strength lab|capacity|schedule|class|add classes|attendance/.test(q))return 'Demand is uneven, not universally weak. Strength Lab ran at 82.4% utilisation, and 18 of 57 September classes had net bookings above room capacity—clear evidence of unmet demand. The action plan sizes three added Strength Lab classes per week at roughly 76 additional monthly check-ins. Pair that with targeted changes to underfilled slots rather than broad schedule cuts.';
    if(/renew|churn|retention|member|second visit/.test(q))return 'Retention is the leading base-health risk. The paid-membership renewal rate fell to 59.8%, its lowest reading in twelve months. Separately, 122 first-time clients produced a 9.0% 21-day return rate, the weakest in the period. A practical near-term test is a deliberate second-visit follow-up, measured by cohort, while reporting adjusted revenue separately.';
    if(/cancel|no.?show|booking|late/.test(q))return 'The booking report is the best source for capacity leakage: it breaks the funnel down by late-cancel timing, class format, client behaviour and lead time. Review repeat offenders and the Strength Lab no-show pattern alongside the capacity plan—booked demand does not always convert into a checked-in seat.';
    if(/action|priorit|next two|leadership|recommend|what should/.test(q))return 'Start with reversible, measurable moves: report revenue both including and excluding the ₹420k one-off; add the first three Strength Lab classes where demand is already constrained; begin a second-visit experiment for first-timers; and make repeat-share / renewal measures visible in the monthly pack. Gate wider roster changes on occurrence-level evidence and review thresholds.';
    if(results.length){const first=results[0];return `The strongest match is “${first.heading}” in ${first.reportTitle}. ${makeSnippet(first.text,query)} Use the linked evidence below to jump to the source passage. I found ${results.length} relevant sections across the briefing library.`;}
    return 'I couldn’t find a direct match in the loaded reports. Try a report topic or metric such as revenue, utilisation, Strength Lab, renewal, cancellation, or roster impact.';
  }
  function askAgent(query){
    const q=query.trim();if(!q)return;
    const results=searchSections(q,4);agentHistory.push({role:'user',text:q});
    const sources=results.slice(0,3).map(r=>({reportId:r.reportId,reportTitle:r.reportTitle,sectionId:r.sectionId,heading:r.heading}));
    agentHistory.push({role:'agent',answer:curatedAnswer(q,results),sources});
    renderDrawer('assistant');
  }

  function openPresenter(){
    const url=new URL('presenter.html',location.href);url.searchParams.set('report',activeReport.id);
    presenterWindow=window.open(url.href,'kwalityHousePresenter','popup,width=1440,height=900');
    if(!presenterWindow){toast('Your browser blocked the presenter window. Allow pop-ups for this briefing.','error');return;}
    followPresenter=true;updateFollowUI();setTimeout(syncStateToPresenter,450);toast('Presenter view opened. This viewport is following live section changes.');
  }
  function toggleFollow(){followPresenter=!followPresenter;updateFollowUI();if(followPresenter)toast(presenterConnected?'Following the presenter.':'Follow mode is on. Open Presenter View to start a live session.');else toast('Presenter follow paused.');if(drawerPanel==='toolkit')renderDrawer('toolkit');syncStateToPresenter();}
  function toggleFocus(){
    const entering=!document.body.classList.contains('focus-mode');document.body.classList.toggle('focus-mode',entering);
    if(entering&&document.documentElement.requestFullscreen)document.documentElement.requestFullscreen().catch(()=>{});
    if(!entering&&document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});
  }
  document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&!document.body.dataset.manualFocus)document.body.classList.remove('focus-mode');});

  function openTeleprompter(text=null,autoStart=false){
    const script=(text ?? (scriptFor() || notesFor())).trim();
    if(!script){openDrawer('toolkit');toast('Add a script in Speaker toolkit to start the teleprompter.');return;}
    $('tpContent').textContent=script;$('tpWindow').scrollTop=0;$('teleprompterOverlay').classList.add('open');$('teleprompterOverlay').setAttribute('aria-hidden','false');
    teleprompterPaused=!autoStart;setTeleprompterButton();
    if(autoStart)startTeleprompter();
  }
  function startTeleprompter(){clearInterval(teleprompterInterval);teleprompterPaused=false;const speed=Number($('tpSpeed').value||3);teleprompterInterval=setInterval(()=>{if(!teleprompterPaused){$('tpWindow').scrollTop+=speed*.42;}},40);setTeleprompterButton();}
  function setTeleprompterButton(){const b=$('tpPause');b.innerHTML=`${icon(teleprompterPaused?'play':'pause')}<span>${teleprompterPaused?'Resume':'Pause'}</span>`;}
  function closeTeleprompter(){clearInterval(teleprompterInterval);teleprompterInterval=null;teleprompterPaused=true;$('teleprompterOverlay').classList.remove('open');$('teleprompterOverlay').setAttribute('aria-hidden','true');}

  function playSfx(type){
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC){toast('Web Audio is not supported in this browser.','error');return;}
    try{
      if(!soundContext)soundContext=new AC();if(soundContext.state==='suspended')soundContext.resume();
      const ctx=soundContext,master=ctx.createGain();master.gain.value=Number(localStorage.getItem('kh_sfx_volume')||.55)*.2;master.connect(ctx.destination);
      const tone=(freq,start,duration,wave='sine',amp=.35,detune=0)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type=wave;o.frequency.value=freq;o.detune.value=detune;g.gain.setValueAtTime(.0001,start);g.gain.exponentialRampToValueAtTime(Math.max(.001,amp),start+.025);g.gain.exponentialRampToValueAtTime(.0001,start+duration);o.connect(g);g.connect(master);o.start(start);o.stop(start+duration+.04);};
      if(type==='chime'){[587.33,739.99,880,1174.66].forEach((f,i)=>tone(f,ctx.currentTime+i*.11,.7,'sine',.38));}
      else if(type==='focus'){tone(659.25,ctx.currentTime,.58,'sine',.45);tone(880,ctx.currentTime+.18,.8,'sine',.32);}
      else if(type==='transition'){
        const duration=.65,buffer=ctx.createBuffer(1,Math.floor(ctx.sampleRate*duration),ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);
        const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),g=ctx.createGain();src.buffer=buffer;filter.type='lowpass';filter.frequency.setValueAtTime(250,ctx.currentTime);filter.frequency.exponentialRampToValueAtTime(3200,ctx.currentTime+duration);g.gain.setValueAtTime(.0001,ctx.currentTime);g.gain.linearRampToValueAtTime(.45,ctx.currentTime+duration*.65);g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+duration);src.connect(filter);filter.connect(g);g.connect(master);src.start();src.stop(ctx.currentTime+duration);
      }else if(type==='applause'){
        const duration=1.45,buffer=ctx.createBuffer(1,Math.floor(ctx.sampleRate*duration),ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++){const t=i/data.length;data[i]=(Math.random()*2-1)*(Math.sin(Math.PI*t)**.9)*(Math.random()>.92?1.8:.38);}
        const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),g=ctx.createGain();src.buffer=buffer;filter.type='bandpass';filter.frequency.value=1450;filter.Q.value=.55;g.gain.value=.35;src.connect(filter);filter.connect(g);g.connect(master);src.start();src.stop(ctx.currentTime+duration);
      }
      setTimeout(()=>master.disconnect(),2000);if(drawerPanel==='soundboard')toast('Cue played.');
    }catch(_){toast('Could not play this cue.','error');}
  }

  function initEvents(){
    document.querySelectorAll('.nav-item[data-report]').forEach(b=>b.addEventListener('click',()=>{loadReport(b.dataset.report);document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n===b));if(window.innerWidth<=900){$('sidebar').classList.remove('mobile-open');$('sidebarScrim').classList.remove('open');}}));
    document.querySelectorAll('.tool-nav[data-panel]').forEach(b=>b.addEventListener('click',()=>openDrawer(b.dataset.panel)));
    $('globalSearchBtn').addEventListener('click',()=>openSearch());$('sidebarSearch').addEventListener('click',()=>openSearch());
    $('outlineBtn').addEventListener('click',()=>openDrawer('outline'));$('notesBtn').addEventListener('click',()=>openDrawer('notes'));$('assistantBtn').addEventListener('click',()=>openDrawer('assistant'));
    $('presentBtn').addEventListener('click',openPresenter);$('bookmarkBtn').addEventListener('click',toggleBookmark);$('focusBtn').addEventListener('click',toggleFocus);
    $('reportExportBtn').addEventListener('click',e=>{e.stopPropagation();toggleReportExportMenu();});
    document.querySelectorAll('[data-report-export]').forEach(b=>b.addEventListener('click',()=>{toggleReportExportMenu(false);exportEntireReport(b.dataset.reportExport);}));
    $('soundFab').addEventListener('click',e=>{e.stopPropagation();toggleSoundPopover();});$('soundFabClose').addEventListener('click',()=>toggleSoundPopover(false));
    document.querySelectorAll('[data-floating-sfx]').forEach(b=>b.addEventListener('click',()=>playSfx(b.dataset.floatingSfx)));
    $('floatingSoundVolume').value=Math.round(Number(localStorage.getItem('kh_sfx_volume')||.55)*100);$('floatingVolumeLabel').textContent=`${$('floatingSoundVolume').value}%`;
    $('floatingSoundVolume').addEventListener('input',()=>{const value=$('floatingSoundVolume').value;localStorage.setItem('kh_sfx_volume',String(Number(value)/100));$('floatingVolumeLabel').textContent=`${value}%`;const full=$('soundVolume');if(full){full.value=value;$('volumeLabel').textContent=`${value}%`;}});
    $('openFullSoundboard').addEventListener('click',()=>{toggleSoundPopover(false);openDrawer('soundboard');});
    $('followBtn').addEventListener('click',toggleFollow);$('teleprompterBtn').addEventListener('click',()=>openTeleprompter());$('stickyQuickBtn').addEventListener('click',()=>openStickyModal());$('soundQuickBtn').addEventListener('click',()=>openDrawer('soundboard'));
    $('drawerClose').addEventListener('click',closeDrawer);$('drawerScrim').addEventListener('click',closeDrawer);
    $('modalScrim').addEventListener('click',()=>{document.querySelectorAll('.modal.open').forEach(m=>closeModal(m));});
    $('annotationClose').addEventListener('click',closeAnnotationModal);$('annotationCancel').addEventListener('click',closeAnnotationModal);$('saveAnnotation').addEventListener('click',()=>saveAnnotation($('annotationNote').value));
    document.querySelectorAll('.color-dot').forEach(b=>b.addEventListener('click',()=>{selectedColor=b.dataset.color;document.querySelectorAll('.color-dot').forEach(x=>x.classList.toggle('selected',x===b));}));
    $('stickyClose').addEventListener('click',()=>closeModal($('stickyModal')));$('stickyCancel').addEventListener('click',()=>closeModal($('stickyModal')));$('saveSticky').addEventListener('click',saveSticky);
    $('shortcutsClose').addEventListener('click',()=>closeModal($('shortcutsModal')));$('openShortcuts').addEventListener('click',()=>openModal($('shortcutsModal')));
    $('exportBtn').addEventListener('click',exportNotes);
    $('fontDown').addEventListener('click',()=>setReaderScale(Math.max(.85,+(readerScale-.05).toFixed(2))));$('fontUp').addEventListener('click',()=>setReaderScale(Math.min(1.25,+(readerScale+.05).toFixed(2))));
    $('tpClose').addEventListener('click',closeTeleprompter);$('tpPause').addEventListener('click',()=>{teleprompterPaused=!teleprompterPaused;if(!teleprompterPaused&&!teleprompterInterval)startTeleprompter();setTeleprompterButton();});
    $('tpSpeed').addEventListener('input',()=>{$('tpSpeedLabel').textContent=`${$('tpSpeed').value}×`;});
    $('selectionToolbar').querySelectorAll('button[data-action]').forEach(b=>b.addEventListener('click',async()=>{
      const action=b.dataset.action;
      if(action==='highlight'){selectedColor='gold';$('annotationCategory').value='insight';$('annotationPriority').value='normal';$('annotationTags').value='';saveAnnotation('');}
      if(action==='annotate')openAnnotationModal();
      if(action==='cite'){const ok=await copyToClipboard(citationForSelection());toast(ok?'Source citation copied.':'Clipboard access was blocked.',ok?'ok':'error');hideSelectionTools();}
      if(action==='copy'){const ok=await copyToClipboard(selectedQuote);toast(ok?'Selected passage copied.':'Clipboard access was blocked.',ok?'ok':'error');hideSelectionTools();}
    }));
    $('menuToggle').addEventListener('click',()=>{$('sidebar').classList.add('mobile-open');$('sidebarScrim').classList.add('open');});$('closeSidebar').addEventListener('click',()=>{$('sidebar').classList.remove('mobile-open');$('sidebarScrim').classList.remove('open');});$('sidebarScrim').addEventListener('click',()=>{$('sidebar').classList.remove('mobile-open');$('sidebarScrim').classList.remove('open');});
    $('snapshotToggle').addEventListener('click',()=>{$('snapshotGrid').classList.toggle('collapsed');$('snapshotToggle').classList.toggle('is-closed');});
    $('userMenu').addEventListener('click',()=>openDrawer('toolkit'));
    $('drawerBody').addEventListener('click',e=>{
      const a=e.target.closest('[data-drawer-action]');if(a){const action=a.dataset.drawerAction;
        if(action==='open-toolkit')openDrawer('toolkit');if(action==='show-teleprompter'){const scr=$('teleprompterScript')?.value; if(scr)localStorage.setItem(`kh_teleprompter_${activeReport.id}`,scr);openTeleprompter(scr||null,true);}
        if(action==='use-notes-script'){const txt=$('speakerNotes')?.value||notesFor();$('teleprompterScript').value=txt;localStorage.setItem(`kh_teleprompter_${activeReport.id}`,txt);toast('Speaker notes copied into your teleprompter script.');}
        if(action==='present')openPresenter();if(action==='toggle-follow')toggleFollow();if(action==='new-sticky')openStickyModal();if(action==='export')exportNotes();
        if(action==='annotation-help')toast('Select a passage in the report viewport to highlight or comment.');
      }
      const delA=e.target.closest('[data-delete-annotation]');if(delA)deleteAnnotation(delA.dataset.deleteAnnotation);
      const editA=e.target.closest('[data-edit-annotation]');if(editA){const item=annotationsFor().find(x=>x.id===editA.dataset.editAnnotation);if(item)openAnnotationModal(item);}
      const jump=e.target.closest('[data-jump-annotation]');if(jump){scrollToAnnotation(jump.dataset.jumpAnnotation);}
      const delS=e.target.closest('[data-delete-sticky]');if(delS)deleteSticky(delS.dataset.deleteSticky);
    });
    $('drawerBody').addEventListener('input',e=>{
      if(e.target.matches('[data-sticky-input]'))updateSticky(e.target.dataset.stickyInput,e.target.value);
    });
    $('searchInput').addEventListener('input',()=>renderSearch($('searchInput').value));
    $('searchInput').addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();moveSearchSelection(1);}if(e.key==='ArrowUp'){e.preventDefault();moveSearchSelection(-1);}if(e.key==='Enter'){e.preventDefault();openSearchResult(selectedSearchIndex);}});
    $('searchResults').addEventListener('click',e=>{const b=e.target.closest('[data-query]');if(b){$('searchInput').value=b.dataset.query;renderSearch(b.dataset.query);}});
    document.addEventListener('click',e=>{if(!e.target.closest('.export-control'))toggleReportExportMenu(false);if(!e.target.closest('#soundFabWrap'))toggleSoundPopover(false);});
    $('selectionToolbar').addEventListener('mousedown',e=>e.preventDefault());
    document.addEventListener('mousedown',e=>{if(!e.target.closest('#selectionToolbar'))setTimeout(()=>{if(!frame.contentWindow?.getSelection()?.toString())hideSelectionTools();},10);});
    document.addEventListener('keydown',onKeydown);
  }
  function setReaderScale(value){readerScale=value;localStorage.setItem('kh_reader_scale',String(readerScale));$('fontLabel').textContent=`${Math.round(readerScale*100)}%`;if(frameReady)readerOverrides();}
  function onKeydown(e){
    const typing=e.target.matches('input,textarea,select,[contenteditable="true"]');
    const mod=e.metaKey||e.ctrlKey;
    if(mod&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch();return;}
    if(mod&&e.key.toLowerCase()==='f'){e.preventDefault();openSearch();return;}
    if(mod&&(e.key==='/'||e.key==='?')){e.preventDefault();openModal($('shortcutsModal'));return;}
    if(e.key==='Escape'){
      if($('teleprompterOverlay').classList.contains('open')){closeTeleprompter();return;}
      if($('reportExportMenu').classList.contains('open')){toggleReportExportMenu(false);return;}
      if($('soundFabPopover').classList.contains('open')){toggleSoundPopover(false);return;}
      if(document.querySelector('.modal.open')){document.querySelectorAll('.modal.open').forEach(m=>closeModal(m));return;}
      if($('drawer').classList.contains('open')){closeDrawer();return;}
      if(document.body.classList.contains('focus-mode')){toggleFocus();return;}
      hideSelectionTools();return;
    }
    if(typing||mod)return;
    if(e.altKey&&e.key==='ArrowRight'){e.preventDefault();moveReport(1);return;}
    if(e.altKey&&e.key==='ArrowLeft'){e.preventDefault();moveReport(-1);return;}
    if(e.altKey)return;
    const key=e.key.toLowerCase();
    if(key==='f'){e.preventDefault();toggleFocus();}
    else if(key==='n'){e.preventDefault();openDrawer('notes');}
    else if(key==='p'){e.preventDefault();openPresenter();}
    else if(key==='t'){e.preventDefault();openTeleprompter();}
  }
  function moveReport(delta){const i=REPORT_ORDER.indexOf(activeReport.id);const next=REPORT_ORDER[(i+delta+REPORT_ORDER.length)%REPORT_ORDER.length];loadReport(next);}

  function initChannel(){
    if(!channel)return;
    channel.onmessage=e=>{const msg=e.data||{};
      if(msg.type==='presenterHello'){presenterConnected=true;channel.postMessage({type:'mainState',reportId:activeReport.id,sectionId:activeHeadings[0]?.id||null,sectionIndex:0,scrollRatio:0,sectionTitle:'',follow:followPresenter});if(followPresenter)toast('Presenter connected. Following live updates.');}
      if(msg.type==='presenterBye'){presenterConnected=false;}
      if(msg.type==='followState'){followPresenter=Boolean(msg.active);updateFollowUI();}
      if(msg.type==='navigate'&&followPresenter){
        if(msg.reportId!==activeReport.id)loadReport(msg.reportId,msg.sectionId||msg.sectionIndex);
        else if(msg.sectionId)scrollToSection(msg.sectionId);else if(Number.isInteger(msg.sectionIndex))scrollToSection(msg.sectionIndex);
      }
      if(msg.type==='remoteScroll'&&followPresenter&&msg.reportId===activeReport.id&&frameReady){const d=frame.contentDocument,w=frame.contentWindow,root=d.scrollingElement||d.documentElement;const max=Math.max(1,root.scrollHeight-w.innerHeight);w.scrollTo({top:max*Math.max(0,Math.min(1,msg.ratio||0)),behavior:'smooth'});}
      if(msg.type==='teleprompter'&&followPresenter){if(msg.active)openTeleprompter(msg.text,true);else closeTeleprompter();}
    };
  }

  function init(){
    $('fontLabel').textContent=`${Math.round(readerScale*100)}%`;updateFollowUI();updateReportChrome();initEvents();initChannel();
    frame.addEventListener('load',()=>{const src=frame.getAttribute('src')||'';if(src==='about:blank'||!frame.dataset.reportId)return;try{enhanceFrame();}catch(err){console.error(err);setLoading(false);toast('This report could not be enhanced. Original content is still available.','error');}});
    loadReport(activeReport.id);buildSearchIndex();
    if('serviceWorker' in navigator&&location.protocol.startsWith('http')){/* intentionally no remote worker: report files stay editable */}
  }
  init();
})();
