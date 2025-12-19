// quick-results-highlight.js v1.1 - Dynamic Color
(function(){
'use strict';

const LIST_SEL = ['#quick-results-list','.quick-results-grid','#quick-results','[data-role="quick-results"]'];

function getContainer(){
  for (const sel of LIST_SEL){
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function clear(){
  const box = getContainer();
  if (!box) return;
  box.querySelectorAll('.qr-selected').forEach(n => n.classList.remove('qr-selected'));
}

function select(id,type){
  const box = getContainer();
  if (!box) return;
  clear();
  
  const card = box.querySelector(`[data-id="${CSS.escape(id)}"][data-type="${CSS.escape(type)}"]`)
    || box.querySelector(`[data-code="${CSS.escape(id)}"]`);
  
  if (card){
    card.classList.add('qr-selected');
    card.scrollIntoView({ block:'nearest', behavior:'smooth' });
  }
}

document.addEventListener('quick:select', (e)=>{
  const {id,type} = e.detail || {};
  if (!id || !type) return;
  select(id,type);
});

})(); // ← THÊM dòng này nếu thiếu