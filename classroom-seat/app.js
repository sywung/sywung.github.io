const STORAGE_KEY = 'classroom-seat-v2';
const $ = id => document.getElementById(id);
// Cadre titles are user-editable: each inner array becomes one title row (plus its value
// row) in the printed table, so the shape of the printed table follows this data.
const DEFAULT_CADRE_TITLES=[
  ['班長','學藝股長','風紀股長','衛生股長','體育股長','總務股長','資源股長','資訊股長','春暉股長'],
  ['副班長','學藝幹事','風紀幹事','衛生幹事','體育幹事','總務幹事','資源幹事','資訊幹事','小張老師']
];
const cloneCadreTitles=rows=>rows.map(row=>[...row]);
let state = { rows:6, columns:7, students:[], seats:[], fixed:[], empty:[], history:[], meta:{school:'',year:'',semester:'上',className:'',teacher:''}, cadres:{}, cadreTitles:cloneCadreTitles(DEFAULT_CADRE_TITLES), selected:null, emptyMode:false };
// Titles are stored trimmed; empty strings are kept mid-row so a row can have a blank slot,
// but trailing blanks and all-blank rows are dropped.
function normalizeCadreTitles(rows) {
  if (!Array.isArray(rows)) return cloneCadreTitles(DEFAULT_CADRE_TITLES);
  const cleaned=rows
    .filter(Array.isArray)
    .map(row=>{ const titles=row.map(t=>typeof t==='string'?t.trim():''); while(titles.length && !titles[titles.length-1]) titles.pop(); return titles; })
    .filter(row=>row.length);
  return cleaned.length?cleaned:cloneCadreTitles(DEFAULT_CADRE_TITLES);
}
function parseCadreTitles(text) { return normalizeCadreTitles(text.split(/\r?\n/).map(line=>line.split(/[,，\t]/))); }
function cadreTitlesToText(rows) { return rows.map(row=>row.join('，')).join('\n'); }
function cadreTitleList() { return state.cadreTitles.flat().filter(Boolean); }
let dragSource=null; let dragMoved=false; let suppressClick=false;

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify({...state, selected:null, emptyMode:false})); }
function load() { try { const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)); if (saved) state={...state,...saved,cadreTitles:normalizeCadreTitles(saved.cadreTitles),selected:null,emptyMode:false}; } catch {} }
function showMessage(text='') { $('message').textContent=text; }
function showRosterMessage(text='') { $('rosterMessage').textContent=text; }
function showSetupMessage(text='') { $('setupMessage').textContent=text; }
function showCadreTitlesMessage(text='') { $('cadreTitlesMessage').textContent=text; }
function studentByNo(no) { return state.students.find(s=>s.no===no); }
function escapeHtml(text) { return text.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function applyConfig() {
  const rows=Math.max(1, Math.min(20, Number($('rows').value)||6)); const columns=Math.max(1, Math.min(20, Number($('columns').value)||7));
  const start=Math.max(1, Math.floor(Number($('startNumber').value)||1)); const count=Math.max(0, Math.min(400, Math.floor(Number($('studentCount').value)||0)));
  const capacity=rows*columns;
  if (count>capacity) return showSetupMessage(`學生人數（${count}）超過座位數（${capacity}）。`);
  const existingByNo=new Map(state.students.map(s=>[s.no,s]));
  const students=Array.from({length:count},(_,i)=>{ const no=start+i; return {no, name:existingByNo.get(no)?.name||''}; });
  state.rows=rows; state.columns=columns; state.students=students; state.seats=Array(capacity).fill(null); state.fixed=[]; state.empty=[];
  showSetupMessage('座號已產生，原有座號的姓名資料已保留；請移除不在班上的座號，或直接指定座位。'); save(); render();
}
const CHINESE_NAME=/^[一-鿿]{2,6}$/;
function parseRoster(text) {
  const students=[]; const seen=new Set();
  text.split('\n').forEach(line=>{
    const trimmed=line.trim(); if (!trimmed) return;
    const parts=trimmed.split(/[\t,，]+|\s+/).filter(Boolean);
    if (!parts.length) return;
    const no=parseInt(parts[0],10); if (!Number.isInteger(no) || no<=0) return;
    const rest=parts.slice(1);
    const nameField=rest.find(p=>CHINESE_NAME.test(p));
    const name=(nameField??rest.join('')).trim();
    if (seen.has(no)) return; seen.add(no); students.push({no,name});
  });
  students.sort((a,b)=>a.no-b.no); return students;
}
function importRoster() {
  const raw=$('rosterInput').value; const students=parseRoster(raw);
  if (!students.length) return showRosterMessage('沒有讀到有效的座號，請確認格式為「座號 姓名」。');
  const capacity=state.rows*state.columns;
  if (students.length>capacity) return showRosterMessage(`學生人數（${students.length}）超過座位數（${capacity}）。`);
  if (state.students.length && !confirm(`將取代目前的座號清單（${state.students.length} 人）與座位安排，確定要繼續嗎？`)) return;
  state.students=students; state.seats=Array(capacity).fill(null); state.fixed=[]; state.empty=[]; state.selected=null;
  showRosterMessage(`已建立 ${students.length} 位學生名單，請將座號拖曳或指定到座位。`); save(); render();
}
function render() {
  $('rows').value=state.rows; $('columns').value=state.columns; $('startNumber').value=state.students[0]?.no||1; $('studentCount').value=state.students.length;
  $('metaSchool').value=state.meta.school; $('metaYear').value=state.meta.year; $('metaSemester').value=state.meta.semester; $('metaClass').value=state.meta.className; $('metaTeacher').value=state.meta.teacher;
  $('remaining').textContent=`未安排 ${state.students.filter(s=>!state.seats.includes(s.no)).length} 人`;
  $('studentList').innerHTML='';
  state.students.forEach(s=>{ const n=s.no; const item=document.createElement('span'); item.className='student-item'; const b=document.createElement('button'); b.className=`student ${state.selected===n?'selected':''} ${state.seats.includes(n)?'assigned':''}`; b.textContent=s.name?`${n} ${s.name}`:n; b.title=state.seats.includes(n)?'已安排':'選擇座號'; b.onclick=()=>{if(state.seats.includes(n)) return; state.selected=state.selected===n?null:n; state.emptyMode=false; render();}; const remove=document.createElement('button'); remove.className='remove-student'; remove.textContent='×'; remove.title=`移除座號 ${n}`; remove.onclick=()=>removeStudent(n); item.append(b,remove); $('studentList').append(item); });
  if (!state.students.length) $('studentList').innerHTML='<span class="history-empty">尚未產生座號</span>';
  $('emptyMode').classList.toggle('primary',state.emptyMode); $('emptyMode').classList.toggle('secondary',!state.emptyMode);
  $('seatGridEmpty').hidden=Boolean(state.seats.length); $('seatGrid').style.gridTemplateColumns=`repeat(${state.columns}, minmax(45px, 1fr))`; $('seatGrid').innerHTML='';
  state.seats.forEach((student,index)=>{ const b=document.createElement('button'); const isEmpty=state.empty.includes(index); b.className=`seat ${student?'assigned':''} ${isEmpty?'empty':''} ${state.fixed.includes(index)?'fixed':''}`; if (student) { const name=studentByNo(student)?.name||''; b.innerHTML=`<span class="seat-no">${student}</span>${name?`<span class="seat-name">${escapeHtml(name)}</span>`:''}`; } else { b.textContent=isEmpty?'空位':'—'; } b.title=student?'按住拖曳可換位':'座位'; b.draggable=Boolean(student); b.onclick=()=>{if(suppressClick){suppressClick=false;return;} seatClick(index);}; b.ondragstart=event=>{dragSource=index;event.dataTransfer.effectAllowed='move';}; b.ondragover=event=>{if(dragSource!==null)event.preventDefault();}; b.ondrop=event=>{event.preventDefault();if(dragSource!==null)swapSeats(dragSource,index);dragSource=null;}; b.onpointerdown=event=>{if(!student||event.pointerType==='mouse')return;dragSource=index;dragMoved=false;b.setPointerCapture?.(event.pointerId);}; b.onpointermove=event=>{if(event.pointerType==='mouse'||dragSource!==index)return;if(Math.abs(event.movementX)>6||Math.abs(event.movementY)>6){dragMoved=true;b.classList.add('dragging');}}; b.onpointerup=event=>{if(event.pointerType==='mouse'||dragSource===null)return; const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.seat'); if(dragMoved){const targetIndex=[...$('seatGrid').children].indexOf(target);if(targetIndex>=0)swapSeats(dragSource,targetIndex);suppressClick=true;setTimeout(()=>{suppressClick=false;},0);} b.releasePointerCapture?.(event.pointerId); b.classList.remove('dragging');dragSource=null;dragMoved=false;}; $('seatGrid').append(b); });
  $('savedAt').textContent=state.history.length?`最近產生：${state.history[0].date}`:'尚未產生座位表'; renderCadreSelects(); renderHistory();
}
function renderCadreSelects() {
  const box=$('cadreFields'); box.innerHTML='';
  cadreTitleList().forEach(title=>{
    const field=document.createElement('div'); field.className='field';
    const label=document.createElement('label'); label.textContent=title;
    const select=document.createElement('select');
    const blank=document.createElement('option'); blank.value=''; blank.textContent='—'; select.append(blank);
    state.students.forEach(s=>{ const opt=document.createElement('option'); opt.value=s.no; opt.textContent=s.name?`${s.no} ${s.name}`:`${s.no}`; select.append(opt); });
    const current=state.cadres[title];
    if (current && studentByNo(current)) select.value=String(current);
    select.onchange=()=>{ if (select.value) state.cadres[title]=Number(select.value); else delete state.cadres[title]; save(); };
    field.append(label,select); box.append(field);
  });
}
function removeStudent(number) {
  const index=state.seats.indexOf(number); if(index>=0){state.seats[index]=null;state.fixed=state.fixed.filter(i=>i!==index);}
  state.students=state.students.filter(s=>s.no!==number); if(state.selected===number) state.selected=null; save(); showMessage(`已移除座號 ${number}。`); render();
}
function swapSeats(first, second) {
  if(first===second) return;
  [state.seats[first],state.seats[second]]=[state.seats[second],state.seats[first]];
  const firstFixed=state.fixed.includes(first); const secondFixed=state.fixed.includes(second);
  state.fixed=state.fixed.filter(index=>index!==first&&index!==second);
  if(firstFixed) state.fixed.push(second); if(secondFixed) state.fixed.push(first);
  const firstEmpty=state.empty.includes(first); const secondEmpty=state.empty.includes(second);
  state.empty=state.empty.filter(index=>index!==first&&index!==second);
  if(firstEmpty) state.empty.push(second); if(secondEmpty) state.empty.push(first);
  save(); showMessage('座位已換位。'); render();
}
function seatClick(index) {
  if (state.emptyMode) { if (state.seats[index]) return showMessage('請先清除這個座位的座號。'); if (state.empty.includes(index)) state.empty=state.empty.filter(i=>i!==index); else state.empty.push(index); save(); render(); return; }
  if (state.selected===null) { if (state.seats[index]) { state.seats[index]=null; state.fixed=state.fixed.filter(i=>i!==index); save(); render(); } else showMessage('請先選擇左側的座號。'); return; }
  const oldIndex=state.seats.indexOf(state.selected); if (oldIndex>=0) { state.seats[oldIndex]=null; state.fixed=state.fixed.filter(i=>i!==oldIndex); }
  state.seats[index]=state.selected; state.fixed=[...new Set([...state.fixed,index])]; state.empty=state.empty.filter(i=>i!==index); state.selected=null; save(); render();
}
function randomize() {
  const capacity=state.rows*state.columns; const occupied=state.seats.filter(Boolean); const studentNumbers=state.students.map(s=>s.no); const missing=studentNumbers.filter(n=>!occupied.includes(n));
  const fixedValues=state.fixed.map(i=>state.seats[i]).filter(Boolean); const pool=studentNumbers.filter(n=>!fixedValues.includes(n));
  for (let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  const next=Array(capacity).fill(null); state.fixed.forEach(i=>{next[i]=state.seats[i];}); let cursor=0;
  for(let i=0;i<capacity;i++) if(!state.fixed.includes(i) && !state.empty.includes(i)) next[i]=pool[cursor++]||null;
  state.seats=next; const date=new Date().toLocaleString('zh-TW'); state.history.unshift({date, seats:[...next], empty:[...state.empty]}); state.history=state.history.slice(0,20); state.selected=null; save(); showMessage('座位表已重新抽選。'); render();
}
function clearAll() { state.seats=Array(state.rows*state.columns).fill(null); state.fixed=[]; state.empty=[]; state.selected=null; save(); showMessage('已清除目前座位安排。'); render(); }
function clearStudents() {
  if (!state.students.length) return showSetupMessage('目前沒有學生資料。');
  if (!confirm(`將清除全部學生資料（${state.students.length} 人），包含座位安排與班級幹部名單，確定要繼續嗎？`)) return;
  state.students=[]; state.seats=Array(state.rows*state.columns).fill(null); state.fixed=[]; state.empty=[]; state.cadres={}; state.selected=null;
  save(); showSetupMessage('已清除全部學生資料。'); render();
}
function renderHistory(){ const box=$('history'); if(!state.history.length){box.className='history-empty';box.textContent='產生座位表後，結果會保存在這台裝置的瀏覽器。';return;} box.className=''; box.innerHTML=state.history.map((h,i)=>`<div class="history-item"><span>${h.date}</span><span>${h.seats.filter(Boolean).length} 人、${h.empty.length} 個空位${i===0?'（目前）':''}</span></div>`).join(''); }
function exportJSON(){
  const data={...state, selected:null, emptyMode:false};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`座位表資料-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(a.href);
}
function importJSONFile(event){
  const file=event.target.files[0]; event.target.value='';
  if (!file) return;
  const reader=new FileReader();
  reader.onload=()=>{
    let data;
    try { data=JSON.parse(reader.result); } catch { return showMessage('JSON 檔案格式錯誤，無法匯入。'); }
    if (!Array.isArray(data.students) || !Array.isArray(data.seats) || !Number.isInteger(data.rows) || !Number.isInteger(data.columns)) return showMessage('JSON 內容缺少必要欄位，無法匯入。');
    if (!confirm('匯入將取代目前頁面上的所有資料（座位、名單、設定），確定要繼續嗎？')) return;
    state={
      rows:data.rows, columns:data.columns, students:data.students, seats:data.seats,
      fixed:Array.isArray(data.fixed)?data.fixed:[], empty:Array.isArray(data.empty)?data.empty:[], history:Array.isArray(data.history)?data.history:[],
      meta:{school:'',year:'',semester:'上',className:'',teacher:'',...(data.meta||{})},
      cadres:(data.cadres && typeof data.cadres==='object' && !Array.isArray(data.cadres))?data.cadres:{},
      cadreTitles:normalizeCadreTitles(data.cadreTitles),
      selected:null, emptyMode:false
    };
    save(); syncCadreTitlesInput(); showMessage('已匯入完整資料。'); render();
  };
  reader.readAsText(file);
}
function populatePrintView() {
  $('printSchoolText').textContent=state.meta.school||'';
  $('printYearText').textContent=state.meta.year||'＿＿＿';
  $('printSemesterText').textContent=state.meta.semester||'＿';
  $('printClassText').textContent=state.meta.className||'＿＿＿';
  $('printTeacherText').textContent=state.meta.teacher||'';
  // Cadre table mirrors the paper template: title row + blank/name row, twice; the
  // teacher's name sits in the last header cell of the second title row (per template).
  const cadreTable=$('printCadreTable');
  const hasCadres=cadreTitleList().some(t=>state.cadres[t] && studentByNo(state.cadres[t]));
  $('printCadreWrap').hidden=!hasCadres;
  if (hasCadres) {
    // Value cells are split into a narrow seat-no sub-column + name column (real table
    // columns, headers span both via colspan=2), matching the paper template.
    const cadreCells=t=>{ const s=t?studentByNo(state.cadres[t]):null; return `<td class="print-cadre-no">${s?s.no:''}</td><td class="print-cadre-name">${s?escapeHtml(s.name||''):''}</td>`; };
    // Rows can differ in length; short rows are padded so every row spans the same columns.
    const width=Math.max(...state.cadreTitles.map(row=>row.length));
    const padded=state.cadreTitles.map(row=>[...row,...Array(width-row.length).fill('')]);
    cadreTable.innerHTML=
      `<colgroup>${'<col class="print-cadre-col-no"><col>'.repeat(width)}</colgroup>`+
      padded.map(row=>
        `<tr>${row.map(t=>`<th colspan="2">${escapeHtml(t)}</th>`).join('')}</tr>`+
        `<tr>${row.map(cadreCells).join('')}</tr>`
      ).join('');
  }
  // Roster prints consecutive seat numbers from min to max; removed numbers in the
  // range keep their row with a blank name. Hidden entirely when no student has a name.
  const hasNames=state.students.some(s=>s.name);
  $('printRosterWrap').hidden=!hasNames;
  if (hasNames) {
    const nos=state.students.map(s=>s.no);
    const minNo=Math.min(...nos), maxNo=Math.max(...nos);
    const rosterRows=[];
    for(let no=minNo;no<=maxNo;no++){ const s=studentByNo(no); rosterRows.push(`<tr><td>${no}</td><td>${s?escapeHtml(s.name||''):''}</td></tr>`); }
    $('printRosterTable').innerHTML=`<thead><tr><th>座號</th><th>姓名</th></tr></thead><tbody>${rosterRows.join('')}</tbody>`;
  }
  $('printSeatGrid').style.gridTemplateColumns=`repeat(${state.columns}, 1fr)`;
  // 講台 is printed below the grid (teacher's viewpoint), while state.seats is stored in
  // student-viewpoint order (row 0 = nearest podium, drawn first/top on screen). Reversing
  // the flattened row-major array is equivalent to rotating the whole grid 180°, so the row
  // nearest the podium ends up drawn nearest the printed 講台 label, as a teacher facing the
  // class would see it (row order AND left/right both flip together).
  const printCells=state.seats.map((student,index)=>{
    if (state.empty.includes(index)) return '<div class="print-seat print-seat-empty">空位</div>';
    if (!student) return '<div class="print-seat"></div>';
    const name=studentByNo(student)?.name||'';
    return `<div class="print-seat"><span class="print-seat-no">${student}</span>${name?`<span class="print-seat-name">${escapeHtml(name)}</span>`:''}</div>`;
  });
  $('printSeatGrid').innerHTML=printCells.slice().reverse().join('');
  const today=new Date();
  $('printDateText').textContent=`${today.getFullYear()}/${String(today.getMonth()+1).padStart(2,'0')}/${String(today.getDate()).padStart(2,'0')}`;
}
function printChart() {
  if (!state.seats.length) return showMessage('請先建立座位表再列印。');
  populatePrintView();
  const d=new Date(); const pad=n=>String(n).padStart(2,'0');
  const stamp=`${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const originalTitle=document.title;
  document.title=state.meta.className?`${stamp}_${state.meta.className}`:stamp;
  window.print();
  document.title=originalTitle;
}
function syncCadreTitlesInput() { $('cadreTitlesInput').value=cadreTitlesToText(state.cadreTitles); }
function applyCadreTitles() {
  const rows=parseCadreTitles($('cadreTitlesInput').value);
  const titles=rows.flat().filter(Boolean);
  // state.cadres is keyed by title, so duplicates would silently share one student.
  const duplicate=titles.find((t,i)=>titles.indexOf(t)!==i);
  if (duplicate) return showCadreTitlesMessage(`職稱「${duplicate}」重複，請改成不同名稱。`);
  state.cadreTitles=rows;
  save(); syncCadreTitlesInput(); showCadreTitlesMessage(`已套用 ${titles.length} 個職稱。`); render();
}
function resetCadreTitles() {
  state.cadreTitles=cloneCadreTitles(DEFAULT_CADRE_TITLES);
  save(); syncCadreTitlesInput(); showCadreTitlesMessage('已還原預設職稱。'); render();
}
const FLOATING_PANELS=[{panel:'setupPanel',button:'toggleSetup'},{panel:'rosterPanel',button:'toggleRoster'}];
function closeAllPanels() {
  FLOATING_PANELS.forEach(({panel,button})=>{ $(panel).hidden=true; $(button).classList.remove('active'); $(button).setAttribute('aria-expanded','false'); });
  $('overlayBackdrop').hidden=true;
}
function openPanel(panelId, buttonId) {
  closeAllPanels();
  $(panelId).hidden=false; $(buttonId).classList.add('active'); $(buttonId).setAttribute('aria-expanded','true'); $('overlayBackdrop').hidden=false;
}
function togglePanel(panelId, buttonId) { if ($(panelId).hidden) openPanel(panelId, buttonId); else closeAllPanels(); }
function bindMeta(id, key) { $(id).oninput=()=>{ state.meta[key]=$(id).value; save(); }; }
load(); $('applyConfig').onclick=applyConfig; $('clearStudents').onclick=clearStudents; $('importRoster').onclick=importRoster; $('randomize').onclick=randomize; $('clearAll').onclick=clearAll; $('emptyMode').onclick=()=>{state.emptyMode=!state.emptyMode;state.selected=null;render();}; $('clearSelection').onclick=()=>{state.selected=null;state.emptyMode=false;render();}; $('exportJson').onclick=exportJSON; $('importJsonBtn').onclick=()=>$('importJsonFile').click(); $('importJsonFile').onchange=importJSONFile; $('printChart').onclick=printChart; $('toggleSetup').onclick=()=>togglePanel('setupPanel','toggleSetup'); $('toggleRoster').onclick=()=>togglePanel('rosterPanel','toggleRoster'); $('applyCadreTitles').onclick=applyCadreTitles; $('resetCadreTitles').onclick=resetCadreTitles; $('closeSetup').onclick=closeAllPanels; $('closeRoster').onclick=closeAllPanels; $('overlayBackdrop').onclick=closeAllPanels;
syncCadreTitlesInput();
bindMeta('metaSchool','school'); bindMeta('metaYear','year'); bindMeta('metaSemester','semester'); bindMeta('metaClass','className'); bindMeta('metaTeacher','teacher');
render();
