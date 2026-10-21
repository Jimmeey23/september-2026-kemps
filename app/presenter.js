(() => {
  'use strict';
  const REPORTS={
    '09':{title:'Complete Studio Overview',short:'Studio overview',file:'09_Complete_Studio_Overview_Kwality_House_September_2026.html'},
    '10':{title:'Consolidated Action Plan',short:'Action plan',file:'10_Kwality_House_Consolidated_Action_Plan_September_2026.html'},
    '01':{title:'Sales & Revenue Performance',short:'Sales & revenue',file:'01_Sales_and_Revenue_Performance_Kwality_House_September_2026.html'},
    '02':{title:'Class Performance & Schedule Intelligence',short:'Class performance',file:'02_Kwality_House_Class_Performance_September_2026.html'},
    '03':{title:'Recurring Class Analysis',short:'Recurring classes',file:'03_Kwality_House_Recurring_Class_Analysis_September_2026.html'},
    '04':{title:'Roster Impact & Instructor Changes',short:'Roster impact',file:'04_Kwality_House_Roster_Impact_September_2026.html'},
    '06':{title:'Instructor Performance & Scorecards',short:'Instructor performance',file:'06_Kwality_House_Instructor_Performance_September_2026.html'},
    '07':{title:'Membership Renewal & Churn Performance',short:'Renewal & churn',file:'07_Membership_Renewal_and_Churn_Performance_Kwality_House_September_2026.html'},
    '08':{title:'Late Cancellations & Booking Behaviour',short:'Booking behaviour',file:'08_Late_Cancellations_and_Booking_Behaviour_Kwality_House_September_2026.html'}
  };
  const $=id=>document.getElementById(id);
  const params=new URLSearchParams(location.search);
  let reportId=params.get('report')||localStorage.getItem('kh_current_report')||'09';
  let sections=[];let currentIndex=0;let following=true;let channel=('BroadcastChannel'in window)?new BroadcastChannel('kwality-house-live'):null;
  let elapsed=0,timerRunning=false,timerInterval=null,prompterActive=false,prompterInterval=null;
  let clockTimer=null;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function showToast(text){const t=$('presenterToast');t.textContent=text;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);}
  function shortText(node){if(!node)return'';const clone=node.cloneNode(true);clone.querySelectorAll('svg,style,script').forEach(x=>x.remove());return(clone.textContent||'').replace(/\s+/g,' ').trim();}
  function report(){return REPORTS[reportId]||REPORTS['09'];}
  async function loadReport(id,focusId=null,focusIndex=null){
    if(!REPORTS[id])return;
    reportId=id;params.set('report',id);history.replaceState({},'',`${location.pathname}?${params.toString()}`);
    $('stageReport').textContent=`REPORT ${id} · ${report().short.toUpperCase()}`;
    $('connectionText').textContent='SYNCING';
    try{
      const res=await fetch(`reports/${report().file}`);if(!res.ok)throw new Error('Report unavailable');
      const html=await res.text(),doc=new DOMParser().parseFromString(html,'text/html');
      sections=[...doc.querySelectorAll('section')].map((section,i)=>{
        const h=section.querySelector('h2,h1');if(!h)return null;
        const title=h.textContent.replace(/\s+/g,' ').trim();
        const id=section.id||h.id||`kh-section-${i+1}`;
        const lede=section.querySelector('.lede');
        let excerpt=shortText(lede);
        if(!excerpt){const paragraphs=[...section.querySelectorAll('p')].map(p=>shortText(p)).filter(t=>t.length>20);excerpt=paragraphs.slice(0,2).join(' ');}
        if(!excerpt)excerpt=shortText(section).replace(title,'').trim();
        return{id,title,excerpt:excerpt.slice(0,410),index:i};
      }).filter(Boolean);
      currentIndex=focusId?Math.max(0,sections.findIndex(s=>s.id===focusId)):(Number.isInteger(focusIndex)?Math.max(0,Math.min(focusIndex,sections.length-1)):0);
      renderSection();$('connectionText').textContent=channel?'CONNECTED':'LOCAL VIEW';
      restoreNotes();restoreScript();
    }catch(err){$('currentTitle').textContent='Could not load this report';$('currentExcerpt').textContent='Return to the report viewport and check that the report files are available.';console.error(err);}
  }
  function renderSection(){
    if(!sections.length)return;
    const item=sections[currentIndex];
    $('sectionCounter').textContent=String(currentIndex+1).padStart(2,'0');$('sectionTotal').textContent=String(sections.length).padStart(2,'0');
    $('stageProgressLabel').textContent=`${String(currentIndex+1).padStart(2,'0')} OF ${String(sections.length).padStart(2,'0')}`;
    $('stageProgress').style.width=`${((currentIndex+1)/sections.length)*100}%`;
    $('currentTitle').textContent=item.title;$('currentExcerpt').textContent=item.excerpt||'Section overview ready.';
    $('nextTitle').textContent=sections[(currentIndex+1)%sections.length]?.title||'End of report';
    document.title=`${item.title} · Presenter View`;
  }
  function navigate(index,broadcast=true){
    if(!sections.length)return;currentIndex=(index+sections.length)%sections.length;renderSection();
    if(broadcast&&channel)channel.postMessage({type:'navigate',reportId,sectionId:sections[currentIndex].id,sectionIndex:currentIndex});
  }
  function syncFromMain(msg){
    if(!msg||!msg.reportId)return;
    if(msg.reportId!==reportId){loadReport(msg.reportId,msg.sectionId,msg.sectionIndex);return;}
    if(msg.sectionId){const idx=sections.findIndex(s=>s.id===msg.sectionId);if(idx>=0&&idx!==currentIndex){currentIndex=idx;renderSection();}}
  }
  function restoreNotes(){const box=$('speakerNotes');box.value=localStorage.getItem(`kh_speaker_notes_${reportId}`)||'';}
  function restoreScript(){const box=$('teleprompterScript');box.value=localStorage.getItem(`kh_teleprompter_${reportId}`)||'';}
  function saveNotes(){localStorage.setItem(`kh_speaker_notes_${reportId}`,$('speakerNotes').value);$('notesSaveState').innerHTML='<i></i>Saved locally';}
  function saveScript(){localStorage.setItem(`kh_teleprompter_${reportId}`,$('teleprompterScript').value);}
  function formatTime(sec){return`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;}
  function renderTimer(){ $('timerDisplay').textContent=formatTime(elapsed);$('timerBtn').innerHTML=`<svg><use href="#i-${timerRunning?'pause':'play'}"></use></svg><span>${timerRunning?'Pause timer':'Start timer'}</span>`; }
  function toggleTimer(){timerRunning=!timerRunning;if(timerRunning){timerInterval=setInterval(()=>{elapsed++;renderTimer();},1000);}else{clearInterval(timerInterval);timerInterval=null;}renderTimer();}
  function resetTimer(){clearInterval(timerInterval);timerInterval=null;timerRunning=false;elapsed=0;renderTimer();}
  function startPrompter(){
    const script=$('teleprompterScript').value.trim();if(!script){showToast('Add a script to start the teleprompter.');$('teleprompterScript').focus();return;}
    $('prompterText').textContent=script;if(!$('prompterStage').classList.contains('open'))$('prompterScroll').scrollTop=0;$('prompterStage').classList.add('open');$('prompterStage').setAttribute('aria-hidden','false');prompterActive=true;
    $('prompterStatus').classList.add('on');$('prompterStatus').innerHTML='<i></i>LIVE';$('prompterToggle').innerHTML='<svg><use href="#i-pause"></use></svg><span>Pause</span>';
    const speed=Number($('prompterSpeed').value);clearInterval(prompterInterval);prompterInterval=setInterval(()=>{if(prompterActive)$('prompterScroll').scrollTop+=speed*.42;},40);
    if(channel)channel.postMessage({type:'teleprompter',active:true,text:script,speed});
  }
  function pausePrompter(){prompterActive=!prompterActive;if(prompterActive){startPrompter();return;}clearInterval(prompterInterval);prompterInterval=null;$('prompterStatus').classList.remove('on');$('prompterStatus').innerHTML='<i></i>PAUSED';$('prompterToggle').innerHTML='<svg><use href="#i-play"></use></svg><span>Resume</span>';if(channel)channel.postMessage({type:'teleprompter',active:false});}
  function closePrompter(){prompterActive=false;clearInterval(prompterInterval);prompterInterval=null;$('prompterStage').classList.remove('open');$('prompterStage').setAttribute('aria-hidden','true');$('prompterStatus').classList.remove('on');$('prompterStatus').innerHTML='<i></i>OFF';$('prompterToggle').innerHTML='<svg><use href="#i-play"></use></svg><span>Start</span>';if(channel)channel.postMessage({type:'teleprompter',active:false});}
  function setFollow(value){following=value;$('toggleFollow').textContent=following?'ON':'OFF';$('toggleFollow').classList.toggle('off',!following);$('syncLabel').textContent=following?'Changes follow this presenter window':'Following is paused';if(channel)channel.postMessage({type:'followState',active:following});}
  function updateClock(){const now=new Date();$('clockTime').textContent=new Intl.DateTimeFormat('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}).format(now);}
  function toggleFullscreen(){if(!document.fullscreenElement)document.documentElement.requestFullscreen?.().catch(()=>{});else document.exitFullscreen?.();}
  function init(){
    $('prevSection').addEventListener('click',()=>navigate(currentIndex-1));$('nextSection').addEventListener('click',()=>navigate(currentIndex+1));$('nextUpBtn').addEventListener('click',()=>navigate(currentIndex+1));
    $('speakerNotes').addEventListener('input',saveNotes);$('teleprompterScript').addEventListener('input',saveScript);
    $('timerBtn').addEventListener('click',toggleTimer);$('timerReset').addEventListener('click',resetTimer);
    $('prompterToggle').addEventListener('click',()=>{if(prompterActive)pausePrompter();else startPrompter();});$('prompterClose').addEventListener('click',closePrompter);
    $('prompterSpeed').addEventListener('input',()=>{$('prompterSpeedLabel').textContent=`${$('prompterSpeed').value}×`;if(prompterActive)startPrompter();});
    $('toggleFollow').addEventListener('click',()=>setFollow(!following));$('fullScreenBtn').addEventListener('click',toggleFullscreen);
    $('returnBtn').addEventListener('click',()=>{if(channel)channel.postMessage({type:'presenterBye'});});$('closePresenter').addEventListener('click',()=>{if(channel)channel.postMessage({type:'presenterBye'});window.close();});
    document.addEventListener('keydown',e=>{if(e.target.matches('textarea,input')){if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveNotes();showToast('Speaker notes saved.');}return;}if(e.key==='ArrowRight')navigate(currentIndex+1);if(e.key==='ArrowLeft')navigate(currentIndex-1);if(e.key.toLowerCase()==='f')toggleFullscreen();if(e.key==='Escape'&&prompterActive)closePrompter();});
    if(channel){channel.onmessage=e=>{const msg=e.data||{};if(msg.type==='mainState')syncFromMain(msg);if(msg.type==='followState'){following=Boolean(msg.active);$('toggleFollow').textContent=following?'ON':'OFF';$('toggleFollow').classList.toggle('off',!following);$('syncLabel').textContent=following?'Changes follow this presenter window':'Following is paused';}};channel.postMessage({type:'presenterHello',reportId});$('connectionText').textContent='CONNECTED';}
    $('stageReport').textContent=`REPORT ${reportId} · ${report().short.toUpperCase()}`;loadReport(reportId);setFollow(true);renderTimer();updateClock();clockTimer=setInterval(updateClock,15000);
  }
  init();
})();
