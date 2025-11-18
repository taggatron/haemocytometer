/* Haemocytometer Simulator */
const sim = {
  svg: null,
  cellsGroup: null,
  blur: null,
  liquid: null,
  squareHighlights: null,
  state: {
    loaded: false,
    focus: 60,
    dilution: 1,
    gridSquaresSelected: [0,1,2,3,4], // 0-4 corners+center
    cells: [],
    countedSet: new Set(),
    squareType: 'rbc',
    areaPerSquare: 0.04, // mm^2 for small RBC square
    depth: 0.1,
  }
};

function qs(sel){return document.querySelector(sel)}
function qsa(sel){return Array.from(document.querySelectorAll(sel))}

function init(){
  sim.svg = qs('#simSvg');
  sim.cellsGroup = qs('#cells');
  sim.blur = sim.svg.querySelector('#blurFilter feGaussianBlur');
  sim.liquid = qs('#liquid');
  sim.squareHighlights = qs('#squareHighlights');
  // Hide cells until sample is loaded
  sim.cellsGroup.style.opacity = 0;

  // UI elements
  const btnLoad = qs('#btnLoad');
  const focusSlider = qs('#focusSlider');
  const dilutionInput = qs('#dilutionInput');
  const btnCalculate = qs('#btnCalculate');
  const countInput = qs('#countInput');
  const squaresInput = qs('#squaresInput');
  const squareType = qs('#squareType');
  const areaInput = qs('#areaInput');
  const depthInput = qs('#depthInput');
  const dilutionCalcInput = qs('#dilutionCalcInput');
  const result = qs('#result');

  // Presets
  qs('#btnPresetLow').addEventListener('click',()=> setPreset(60));
  qs('#btnPresetMed').addEventListener('click',()=> setPreset(150));
  qs('#btnPresetHigh').addEventListener('click',()=> setPreset(400));
  qs('#btnReset').addEventListener('click', resetAll);

  // Build squares selection (4 corners + center)
  buildSquaresSelect();

  // Interactions
  btnLoad.addEventListener('click', handleLoad);
  focusSlider.addEventListener('input', e=> setFocus(+e.target.value));
  // Keep dilution in prep step and calc step in sync (two-way)
  dilutionInput.addEventListener('input', e=>{
    const v = Math.max(1, +e.target.value || 1);
    sim.state.dilution = v;
    dilutionCalcInput.value = String(v);
  });

  squareType.addEventListener('change', e=>{
    sim.state.squareType = e.target.value;
    const customAreaRow = document.querySelector('.custom-area');
    if (sim.state.squareType === 'custom') customAreaRow.classList.remove('hidden');
    else customAreaRow.classList.add('hidden');

    if (sim.state.squareType === 'rbc') sim.state.areaPerSquare = 0.04; // 0.2 x 0.2 mm
    if (sim.state.squareType === 'wbc') sim.state.areaPerSquare = 1.0;   // 1 x 1 mm
    areaInput.value = sim.state.areaPerSquare;
  });

  areaInput.addEventListener('input', e=> sim.state.areaPerSquare = Math.max(0.0001, +e.target.value || 0.04));
  depthInput.addEventListener('input', e=> sim.state.depth = Math.max(0.01, +e.target.value || 0.1));
  dilutionCalcInput.addEventListener('input', e=>{
    const v = Math.max(1, +e.target.value || 1);
    sim.state.dilution = v;
    dilutionInput.value = String(v);
  });

  btnCalculate.addEventListener('click', ()=>{
    const N = +countInput.value || 0;
    const S = +squaresInput.value || 1;
    const area = sim.state.squareType === 'custom' ? ( +areaInput.value || sim.state.areaPerSquare ) : sim.state.areaPerSquare;
    const d = +depthInput.value || sim.state.depth;
    const D = +dilutionCalcInput.value || sim.state.dilution || 1;

    const volPerSquare_mm3 = area * d; // 1 mm^3 = 1 uL
    const cellsPer_uL = (N / (S * volPerSquare_mm3)) * D; // cells per uL
    const cellsPer_mL = cellsPer_uL * 1000;

    result.innerHTML = `
      <div><strong>${Math.round(cellsPer_uL).toLocaleString()}</strong> cells/µL</div>
      <div><strong>${Math.round(cellsPer_mL).toLocaleString()}</strong> cells/mL</div>
      <small>N=${N}, Squares=${S}, Area=${area} mm², Depth=${d} mm, Dilution=${D}×</small>
    `;
  });

  // Default scene (pre-generate but keep hidden until load)
  setFocus(sim.state.focus);
  setPreset(150);
  // Initialize calc dilution to match prep dilution input
  dilutionCalcInput.value = String(dilutionInput.value || sim.state.dilution || 1);
}

function setPreset(targetCount){
  // Generate a random synthetic field with approximately targetCount across selected squares
  sim.state.countedSet.clear();
  renderCells(generateCells(targetCount));
  updateCountInputFromScene();
}

function resetAll(){
  sim.state.loaded = false;
  sim.state.countedSet.clear();
  sim.liquid.setAttribute('opacity', '0');
  const droplet = qs('#droplet');
  droplet.style.opacity = 0;
  renderCells([]);
  buildSquaresSelect();
  updateSquareHighlights();
  updateCountInputFromScene();
}

function buildSquaresSelect(){
  const container = qs('#squaresSelect');
  container.innerHTML = '';
  const labels = ['Top-Left','Top-Right','Bottom-Left','Bottom-Right','Center'];
  for (let i=0;i<5;i++){
    const b = document.createElement('button');
    b.className = 'sq-btn' + (sim.state.gridSquaresSelected.includes(i) ? ' active' : '');
    b.textContent = labels[i];
    b.addEventListener('click', ()=>{
      const idx = sim.state.gridSquaresSelected.indexOf(i);
      if (idx>=0) sim.state.gridSquaresSelected.splice(idx,1);
      else sim.state.gridSquaresSelected.push(i);
      buildSquaresSelect();
      updateSquareHighlights();
      updateCountInputFromScene();
    });
    container.appendChild(b);
  }
  updateSquareHighlights();
}

function updateSquareHighlights(){
  const g = sim.squareHighlights;
  g.innerHTML = '';
  // Large grid is 580x440 at x=60,y=60. Large squares assumed 5x5 grid of 100x88
  const x0=60, y0=60, W=580, H=440;
  const colW = W/5, rowH = H/5;
  const picks = [ [0,0], [4,0], [0,4], [4,4], [2,2] ];
  sim.state.gridSquaresSelected.forEach(i=>{
    const [cx,cy] = picks[i];
    const r = document.createElementNS('http://www.w3.org/2000/svg','rect');
    r.setAttribute('x', x0 + cx*colW + 2);
    r.setAttribute('y', y0 + cy*rowH + 2);
    r.setAttribute('width', colW-4);
    r.setAttribute('height', rowH-4);
    r.setAttribute('fill', 'none');
    r.setAttribute('stroke', '#7C3AED');
    r.setAttribute('stroke-width','3');
    r.setAttribute('opacity','0.7');
    g.appendChild(r);
  });

  // Boundary inclusion visuals (top/left include, bottom/right exclude)
  const incTop = makeLine(x0, y0, x0+W, y0, true);
  const incLeft = makeLine(x0, y0, x0, y0+H, true);
  const excBottom = makeLine(x0, y0+H, x0+W, y0+H, false);
  const excRight = makeLine(x0+W, y0, x0+W, y0+H, false);
  g.appendChild(incTop); g.appendChild(incLeft); g.appendChild(excBottom); g.appendChild(excRight);
}

function makeLine(x1,y1,x2,y2,include){
  const l = document.createElementNS('http://www.w3.org/2000/svg','path');
  l.setAttribute('d', `M ${x1} ${y1} L ${x2} ${y2}`);
  l.setAttribute('class', 'boundary' + (include? '' : ' exclude'));
  return l;
}

function setFocus(v){
  sim.state.focus = v;
  const blurPx = Math.max(0, 6 - (v/100)*6); // 6 -> 0 px
  sim.blur.setAttribute('stdDeviation', String(blurPx));
}

function handleLoad(){
  if (sim.state.loaded) return;
  sim.state.loaded = true;
  // Animate pipette movement and droplet into chamber, then show liquid overlay
  const pipette = qs('#pipette');
  const droplet = qs('#droplet');
  pipette.animate([
    { transform: 'translate(50px,-150px) rotate(-10deg)' },
    { transform: 'translate(300px,40px) rotate(-6deg)' },
    { transform: 'translate(420px,80px) rotate(-2deg)' }
  ], { duration: 1600, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }).onfinish = ()=>{
    droplet.style.opacity = 1;
    droplet.animate([
      { transform: 'translateY(0px)' },
      { transform: 'translateY(220px)' }
    ], { duration: 600, easing: 'cubic-bezier(.2,.9,.2,1)', fill: 'forwards' }).onfinish = ()=>{
      sim.liquid.setAttribute('opacity','1');
      // Ensure cells exist; if not, generate a default density
      if (!sim.state.cells || sim.state.cells.length === 0) {
        setPreset(150);
      }
      // Fade cells into view
      sim.cellsGroup.animate([
        { opacity: 0 },
        { opacity: 1 }
      ], { duration: 400, easing: 'ease-out', fill: 'forwards' });
    };
  };
}

function generateCells(target){
  // Generate pseudo-random cells across full grid area (60,60)-(640,500)
  const cells = [];
  const x0=60, y0=60, W=580, H=440;
  const picks = [ [0,0], [4,0], [0,4], [4,4], [2,2] ];
  const selected = new Set(sim.state.gridSquaresSelected);
  const colW = W/5, rowH = H/5;

  // Determine approximate density so selected squares contain ~target
  const selectedArea = selected.size * colW * rowH;
  const totalArea = W * H;
  const density = target / selectedArea; // cells per px^2 (scaled)
  const expectedTotal = Math.round(totalArea * density * 0.6); // scale down so off-squares have fewer

  function jitter(n){ return (Math.random()-0.5)*n }

  // Generate points more densely in selected squares
  for (let i=0;i<5;i++){
    const [cx,cy] = picks[i];
    const baseCount = selected.has(i) ? Math.round(target/selected.size) : Math.round(target/selected.size*0.25);
    for (let k=0;k<baseCount;k++){
      const x = x0 + cx*colW + Math.random()*colW;
      const y = y0 + cy*rowH + Math.random()*rowH;
      const r = 4 + Math.random()*2;
      cells.push({x:x+jitter(3), y:y+jitter(3), r, id:`${i}-${k}-${Math.random().toString(36).slice(2)}`});
    }
  }
  // A sprinkling elsewhere
  for (let k=0;k<Math.max(20, expectedTotal - cells.length); k++){
    const x = x0 + Math.random()*W;
    const y = y0 + Math.random()*H;
    const r = 3.5 + Math.random()*2.5;
    cells.push({x, y, r, id:`m-${k}-${Math.random().toString(36).slice(2)}`});
  }
  sim.state.cells = cells;
  return cells;
}

function renderCells(cells){
  sim.cellsGroup.innerHTML='';
  cells.forEach(cell=>{
    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('class','cell');
    g.setAttribute('data-id', cell.id);
    const c = document.createElementNS('http://www.w3.org/2000/svg','circle');
    c.setAttribute('cx', cell.x);
    c.setAttribute('cy', cell.y);
    c.setAttribute('r', cell.r);
    c.setAttribute('fill', '#0EA5E9');
    c.setAttribute('fill-opacity','0.85');
    c.setAttribute('stroke', '#0369A1');
    c.setAttribute('stroke-width','0.8');

    g.appendChild(c);
    g.addEventListener('click', ()=> toggleCount(cell.id, g, c));
    sim.cellsGroup.appendChild(g);
  });
}

function toggleCount(id, node, circle){
  if (sim.state.countedSet.has(id)){
    sim.state.countedSet.delete(id);
    node.classList.remove('counted');
    circle.setAttribute('fill', '#0EA5E9');
  } else {
    sim.state.countedSet.add(id);
    node.classList.add('counted');
    circle.setAttribute('fill', '#10B981');
  }
  updateCountInputFromScene();
}

function updateCountInputFromScene(){
  qs('#countInput').value = sim.state.countedSet.size;
  qs('#squaresInput').value = sim.state.gridSquaresSelected.length;
}

// Kick off
window.addEventListener('DOMContentLoaded', init);
