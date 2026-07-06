/* =========================================================
   MiniCAD — hatch material catalog (pure data)
   Pattern spacing is VISUAL (screen px on canvas, mm on paper),
   like lineweights — hatches read well at every zoom and scale.
   lines: families of parallel lines {ang°, gap, dash?}; dots: {gap}.
   ========================================================= */
export const MATERIALS = [
  { key:'concrete', name:'Concrete',     color:'#9aa6b2',
    pattern:{ lines:[ {ang:45, gap:11} ] } },
  { key:'brick',    name:'Brick / masonry', color:'#c98a6b',
    pattern:{ lines:[ {ang:0, gap:10}, {ang:90, gap:16} ] } },
  { key:'green',    name:'Green area',   color:'#79c25f',
    pattern:{ dots:{gap:9} } },
  { key:'glass',    name:'Window glass', color:'#7db8e8',
    pattern:{ lines:[ {ang:30, gap:16} ] } },
  { key:'wood',     name:'Wood',         color:'#b08968',
    pattern:{ lines:[ {ang:0, gap:8} ] } },
  { key:'water',    name:'Water',        color:'#5aa7d6',
    pattern:{ lines:[ {ang:0, gap:12, dash:[8,6]} ] } },
];
export const materialByKey = key => MATERIALS.find(m => m.key === key) || null;
