'use strict';
/* Datos del programa — extraídos de "Rutina_v3_Gluteo_Femoral_VO2max.pdf" (Versión 3) */

// Catálogo de ejercicios. reps: [mín, máx]; unit: 'reps' | 'sec'; lower: tren inferior (para la progresión de carga)
const EX = {
  rdl:               { name: 'Peso muerto rumano', sub: 'Mancuernas o barra', reps: [8, 10], rest: 90, restLabel: '90 seg', lower: true, focus: 'Femoral + glúteo' },
  prensa:            { name: 'Prensa de piernas', sub: 'Pies arriba y separados', reps: [12, 15], rest: 90, restLabel: '90 seg', lower: true, focus: 'Glúteo (+ femoral)',
                       note: 'Pies arriba en la plataforma, separación algo mayor al ancho de hombros, puntas ligeramente hacia afuera, bajando hasta que la rodilla se acerque bien al pecho.' },
  hip_thrust:        { name: 'Hip thrust', sub: 'Ambas piernas', reps: [8, 10], rest: 90, restLabel: '90 seg', lower: true, focus: 'Glúteo' },
  hip_thrust_1p:     { name: 'Hip thrust a una pierna', sub: 'Por lado', reps: [10, 12], rest: 90, restLabel: '90 seg', lower: true, uni: true, focus: 'Glúteo',
                       note: 'Empieza siempre por la pierna más débil y haz con la más fuerte las mismas repeticiones que logró la débil. Fija el peso según la pierna más débil.' },
  curl_femoral:      { name: 'Curl femoral', sub: 'Tumbado o sentado', reps: [12, 15], rest: 60, restLabel: '60 seg', lower: true, focus: 'Femoral' },
  aductor_maq:       { name: 'Aductor en máquina', reps: [15, 20], rest: 60, restLabel: '45-60 seg', lower: true, focus: 'Aductor' },
  hack:              { name: 'Hack squat profundo', sub: 'Rango completo', reps: [10, 12], rest: 90, restLabel: '90 seg', lower: true, focus: 'Glúteo (+ cuádriceps secundario)',
                       note: 'Pies un poco adelantados en la plataforma, bajar hasta que la cadera pase el nivel de la rodilla sin despegar la zona lumbar, y al subir empujar pensando en "abrir la cadera".' },
  zancada:           { name: 'Zancada hacia atrás', sub: 'Por lado', reps: [8, 10], rest: 90, restLabel: '90 seg', lower: true, uni: true, focus: 'Glúteo (unilateral)',
                       note: 'Torso ligeramente inclinado hacia adelante para cargar más el glúteo; empieza por la pierna más débil.' },
  curl_femoral_maq:  { name: 'Curl femoral en máquina', reps: [10, 12], rest: 60, restLabel: '60 seg', lower: true, focus: 'Femoral', note: 'Opción recomendada para este bloque.' },
  curl_nordico:      { name: 'Curl nórdico', sub: 'Bajada controlada', reps: [4, 6], rest: 60, restLabel: '60 seg', lower: true, bodyweight: true, focus: 'Femoral',
                       note: 'Excéntrico muy exigente: pocas repeticiones bien controladas. Peso opcional (deja vacío si es peso corporal).' },
  copenhagen:        { name: 'Copenhagen plank', sub: 'Segundos por lado', reps: [20, 30], unit: 'sec', rest: 60, restLabel: '60 seg', lower: true, uni: true, bodyweight: true, focus: 'Aductor',
                       note: 'Empieza con la rodilla apoyada en el banco (versión corta) y pasa al pie apoyado cuando completes 30 seg por lado con buena técnica. Progresión: +5 seg por lado.' },
  aductor_maq_alt:   { name: 'Aductor en máquina', sub: 'Alternativa al Copenhagen', reps: [12, 15], rest: 60, restLabel: '60 seg', lower: true, focus: 'Aductor' },
  press_banca:       { name: 'Press banca o press en máquina', reps: [8, 10], rest: 120, restLabel: '90-120 seg', focus: 'Pecho' },
  remo:              { name: 'Remo con barra o máquina', reps: [8, 10], rest: 120, restLabel: '90-120 seg', focus: 'Espalda' },
  press_militar:     { name: 'Press militar con mancuernas', reps: [10, 12], rest: 90, restLabel: '90 seg', focus: 'Hombro (frontal)' },
  jalon:             { name: 'Jalón al pecho', reps: [10, 12], rest: 90, restLabel: '60-90 seg', focus: 'Espalda' },
  elev_lat:          { name: 'Elevaciones laterales', reps: [12, 15], rest: 60, restLabel: '60 seg', focus: 'Hombro lateral' },
  curl_biceps:       { name: 'Curl de bíceps', reps: [12, 15], rest: 60, restLabel: '60 seg al terminar el par', focus: 'Bíceps' },
  ext_triceps:       { name: 'Extensión de tríceps', reps: [12, 15], rest: 60, restLabel: '60 seg al terminar el par', focus: 'Tríceps' },
  press_pecho_maq:   { name: 'Press de pecho en máquina', reps: [10, 12], rest: 90, restLabel: '60-90 seg', focus: 'Pecho' },
  remo_uni:          { name: 'Remo unilateral', sub: 'Por lado', reps: [10, 10], rest: 90, restLabel: '60-90 seg', uni: true, focus: 'Espalda' },
  face_pull:         { name: 'Face pulls', reps: [15, 15], rest: 60, restLabel: '60 seg al terminar el par', focus: 'Hombro posterior' },
  curl_martillo:     { name: 'Curl martillo', reps: [10, 12], rest: 60, restLabel: '60 seg al terminar el par', focus: 'Bíceps / antebrazo' },
  ext_triceps_cabeza:{ name: 'Extensión de tríceps sobre la cabeza', reps: [10, 12], rest: 60, restLabel: '60 seg al terminar el par', focus: 'Tríceps' },
};

// Cada item: { id, sets, alt?, ss? (letra de superserie), rest? (override), optional? }
const PROGRAM = {
  '4': {
    label: 'Programa 4 días',
    days: [
      { id: 'd1', short: 'Día 1', name: 'Tren inferior', focus: 'Glúteo / Femoral / Aductor', weekday: 'Lunes', type: 'lower', cardio: false,
        items: [
          { id: 'rdl', sets: 4 }, { id: 'prensa', sets: 3 }, { id: 'hip_thrust', sets: 2 }, { id: 'hip_thrust_1p', sets: 2 },
          { id: 'curl_femoral', sets: 3 }, { id: 'aductor_maq', sets: 3 },
        ] },
      { id: 'd2', short: 'Día 2', name: 'Tren superior completo + VO2max', focus: 'Pecho, espalda, hombro, brazo + 4x4', weekday: 'Martes', type: 'upper', cardio: true,
        items: [
          { id: 'press_banca', sets: 4 }, { id: 'remo', sets: 4 }, { id: 'press_militar', sets: 3 }, { id: 'jalon', sets: 3 },
          { id: 'elev_lat', sets: 3 }, { id: 'curl_biceps', sets: 3, ss: 'S' }, { id: 'ext_triceps', sets: 3, ss: 'S' },
        ] },
      { id: 'd3', short: 'Día 3', name: 'Tren inferior (variación)', focus: 'Glúteo / Femoral / Aductor — unilateral', weekday: 'Jueves', type: 'lower', cardio: false,
        items: [
          { id: 'hack', sets: 3 }, { id: 'zancada', sets: 3 },
          { id: 'curl_femoral_maq', sets: 3, alt: 'curl_nordico' }, { id: 'copenhagen', sets: 3, alt: 'aductor_maq_alt' },
        ] },
      { id: 'd4', short: 'Día 4', name: 'Tren superior + VO2max', focus: 'Pecho, espalda, hombro, brazo + 4x4', weekday: 'Viernes', type: 'upper', cardio: true,
        items: [
          { id: 'press_pecho_maq', sets: 3 }, { id: 'remo_uni', sets: 3 },
          { id: 'elev_lat', sets: 3, ss: 'A' }, { id: 'face_pull', sets: 3, ss: 'A' },
          { id: 'curl_martillo', sets: 3, ss: 'B' }, { id: 'ext_triceps_cabeza', sets: 3, ss: 'B' },
        ] },
    ],
  },
  '3': {
    label: 'Variante 3 días (Anexo A)',
    days: [
      { id: 'dA', short: 'Día A', name: 'Tren inferior + hombro', focus: 'Glúteo / Femoral / Aductor + hombro', weekday: 'Lunes', type: 'lower', cardio: false,
        items: [
          { id: 'rdl', sets: 4 }, { id: 'prensa', sets: 3 }, { id: 'hip_thrust', sets: 2 }, { id: 'hip_thrust_1p', sets: 2 },
          { id: 'curl_femoral', sets: 3 }, { id: 'aductor_maq', sets: 3 },
          { id: 'elev_lat', sets: 3, ss: 'S', optional: true }, { id: 'face_pull', sets: 3, ss: 'S', optional: true },
        ] },
      { id: 'dB', short: 'Día B', name: 'Tren superior completo + VO2max', focus: 'Espalda, pecho, hombro, brazo + 4x4', weekday: 'Miércoles', type: 'upper', cardio: true,
        items: [
          { id: 'remo', sets: 4 }, { id: 'jalon', sets: 3 }, { id: 'press_banca', sets: 3, rest: 90, restLabel: '90 seg' }, { id: 'press_militar', sets: 3 },
          { id: 'curl_biceps', sets: 3, ss: 'S' }, { id: 'ext_triceps', sets: 3, ss: 'S' },
        ] },
      { id: 'dC', short: 'Día C', name: 'Tren inferior (variación) + hombro y brazo', focus: 'Glúteo / Femoral / Aductor + hombro y brazo', weekday: 'Viernes', type: 'lower', cardio: false,
        items: [
          { id: 'hack', sets: 3 }, { id: 'zancada', sets: 3 },
          { id: 'curl_femoral_maq', sets: 3, alt: 'curl_nordico' }, { id: 'copenhagen', sets: 3, alt: 'aductor_maq_alt' },
          { id: 'elev_lat', sets: 3, ss: 'S', optional: true }, { id: 'curl_martillo', sets: 3, ss: 'S', optional: true },
        ] },
    ],
  },
};

// Protocolo 4x4 noruego
const PROTOCOL_4X4 = [
  { key: 'warm', label: 'Calentamiento', min: 10, zone: 'easy', desc: 'Suave, subiendo gradualmente' },
  { key: 'i1', label: 'Intervalo 1', min: 4, zone: 'high', n: 1 },
  { key: 'r1', label: 'Recuperación 1', min: 3, zone: 'rec', n: 1 },
  { key: 'i2', label: 'Intervalo 2', min: 4, zone: 'high', n: 2 },
  { key: 'r2', label: 'Recuperación 2', min: 3, zone: 'rec', n: 2 },
  { key: 'i3', label: 'Intervalo 3', min: 4, zone: 'high', n: 3 },
  { key: 'r3', label: 'Recuperación 3', min: 3, zone: 'rec', n: 3 },
  { key: 'i4', label: 'Intervalo 4', min: 4, zone: 'high', n: 4 },
  { key: 'cool', label: 'Enfriamiento', min: 5, zone: 'easy', desc: 'Muy suave' },
];

// Valores de referencia VO2max (mujeres, 30-39 años)
const VO2_REF = [
  { max: 25, label: 'Muy bajo', range: '< 25' },
  { max: 31, label: 'Bajo', range: '25 - 30' },
  { max: 35, label: 'Regular', range: '31 - 34' },
  { max: 40.99, label: 'Bueno', range: '35 - 40' },
  { max: Infinity, label: 'Excelente', range: '> 40' },
];

const VOLUME = [
  ['Glúteo', '7 directas + ~7 indirectas', 'Igual', 'Directas: hip thrust, zancada. Indirectas: RDL, prensa, hack squat'],
  ['Femoral', '10', 'Igual', 'RDL, curl femoral (x2)'],
  ['Aductor', '6 + indirectas', 'Igual', 'Máquina, Copenhagen, prensa, hack squat'],
  ['Espalda', '10 (+3 face pulls)', '7 (+3 face pulls)', 'Remo, jalón, remo unilateral'],
  ['Hombro', '12 (lateral 6, frontal 3, posterior 3)', 'Igual', 'Elevaciones laterales, press militar, face pulls'],
  ['Bíceps', '6', 'Igual', 'Curl, curl martillo (más remos y jalón)'],
  ['Tríceps', '6', '3 + indirectas de 2 press', 'Extensión, extensión sobre la cabeza'],
  ['Pecho', '7', '3', 'Press banca, press de pecho en máquina'],
  ['VO2max (4x4)', '2 sesiones / semana', '1 sesión / semana', 'Solo en días de tren superior'],
];

const GUIDE = [
  { t: 'Resumen y lógica del programa', h: `
    <p>Fuerza orientada a <b>hipertrofia</b> (énfasis en glúteo, femoral y aductor, con volumen suficiente en espalda, hombros y brazos) + intervalos de alta intensidad (<b>protocolo 4x4 noruego</b>) para mejorar el VO2max.</p>
    <p>Como trabajas de pie 8 horas, 6 días a la semana, el VO2max va <b>solo en los días de tren superior</b>, nunca junto a pierna. Todo se trabaja a <b>RPE 7-8</b> (2-3 repeticiones en reserva).</p>
    <p class="muted">Guía educativa de entrenamiento general. No reemplaza la evaluación de un médico, nutricionista o entrenador certificado.</p>` },
  { t: 'Progresión (bloque de 3 meses)', h: `<ul>
    <li>Mantén los mismos ejercicios durante 8-12 semanas para poder comparar semana a semana.</li>
    <li>Cuando completes <b>todas las series en el tope del rango</b> con buena técnica, sube el peso <b>5-10% en tren inferior</b> (<b>2.5-5% en tren superior</b>) y vuelve al inicio del rango. En el Copenhagen plank, sube 5 seg por lado.</li>
    <li>En los ejercicios unilaterales, fija el peso según tu pierna más débil.</li>
    <li>Semanas 1-3: adaptación. Semanas 4-8: cambios claros en fuerza. Semanas 8-12: cambio visible en glúteo y femoral.</li>
    <li><b>Descarga cada 6-8 semanas</b>: la mitad de las series con el mismo peso. Antes si la fuerza se estanca varias sesiones seguidas o las piernas no se recuperan entre días de pierna.</li>
    <li>Si para tu próximo día de pierna aún sientes molestia del anterior, baja una serie o espera un día extra.</li>
    <li>Si el aductor se estanca en 4-6 semanas, súmale una serie.</li></ul>` },
  { t: 'Volumen semanal por músculo', h: '__VOLUME__' },
  { t: 'Frecuencia Cardíaca Máxima (FCmax)', h: `
    <p><b>Opción 1 — Fórmula de Tanaka</b> (rápida, menos precisa): <code>FCmax = 208 − 0.7 × edad</code>. Es una estimación poblacional: tu FCmax real puede variar ±10-12 lpm.</p>
    <p><b>Opción 2 — Test de campo submáximo</b>: tras un buen calentamiento, pedalea a intensidad progresiva 3-5 min, terminando con 1-2 min de esfuerzo casi máximo. El valor más alto del pulsómetro es una buena aproximación.</p>
    <p><b>Opción 3 — Test máximo supervisado</b> en laboratorio, idealmente con análisis de gases (te da además tu VO2max real).</p>
    <p class="muted">Usa Tanaka como punto de partida y ajusta según tu percepción y el pulsómetro (puedes poner tu valor medido en Ajustes).</p>` },
  { t: 'Protocolo 4x4 paso a paso', h: `
    <table class="tbl"><tr><th>Bloque</th><th>Duración</th><th>Intensidad</th></tr>
    <tr><td>Calentamiento</td><td>10 min</td><td>Suave, subiendo gradualmente</td></tr>
    <tr><td>Intervalo ×4</td><td>4 min</td><td>Alta (85-95% FCmax)</td></tr>
    <tr><td>Recuperación ×3</td><td>3 min</td><td>Suave (60-70% FCmax)</td></tr>
    <tr><td>Enfriamiento</td><td>5 min</td><td>Muy suave</td></tr></table>
    <p>Total ~40 min. "Intensidad alta" <b>no es un sprint</b>: es un esfuerzo duro pero sostenible los 4 minutos, donde solo podrías responder con 2-3 palabras. Si a los 2 minutos sientes que no vas a aguantar, ibas demasiado rápido. En la recuperación no te detienes: sigues pedaleando casi sin resistencia.</p>` },
  { t: 'Tests de VO2max (línea base)', h: `
    <p><b>Test de Cooper</b> (12 min corriendo o caminando): <code>VO2max = (metros − 504.9) / 44.73</code>. <b>No sirve en bicicleta.</b></p>
    <p><b>Test de Rockport</b>: camina 1 milla (1609 m) lo más rápido posible; registra el tiempo y tu FC final. La app aplica la fórmula con tiempo, FC final, edad, sexo y peso.</p>
    <p><b>Smartwatch</b>: menos preciso, pero útil para ver tendencias.</p>
    <p>Haz uno durante tu primera semana, antes de empezar los intervalos. Repite el <b>mismo test</b> cada 6-8 semanas en condiciones similares.</p>
    <table class="tbl"><tr><th>Categoría (mujeres 30-39)</th><th>ml/kg/min</th></tr>
    <tr><td>Muy bajo</td><td>&lt; 25</td></tr><tr><td>Bajo</td><td>25 - 30</td></tr><tr><td>Regular</td><td>31 - 34</td></tr><tr><td>Bueno</td><td>35 - 40</td></tr><tr><td>Excelente</td><td>&gt; 40</td></tr></table>` },
  { t: 'Cómo medir tu progreso', h: `
    <p><b>Fuerza</b></p><ul>
    <li>Registra peso, series y repeticiones cada sesión.</li>
    <li>Cada 6-8 semanas, evalúa tu 5RM en peso muerto rumano y hip thrust.</li>
    <li>En unilaterales, compara las repeticiones de cada pierna: la diferencia debería ir cerrándose.</li>
    <li>Circunferencias de muslo, cadera, brazo y hombros cada 4 semanas.</li>
    <li>Fotos de progreso mensuales, con la misma luz, pose y hora del día.</li></ul>
    <p><b>VO2max</b></p><ul>
    <li>Repite el mismo test cada 6-8 semanas.</li>
    <li>En el 4x4 registra la FC de cada intervalo y cuánto tarda en bajar en la recuperación: ese tiempo debería acortarse.</li>
    <li>Con smartwatch, revisa la tendencia de VO2max cada mes.</li>
    <li>Señal de mejora: sostener la misma potencia en bicicleta con una FC más baja.</li></ul>` },
  { t: 'Variante 3 días: qué se pierde', h: `<ul>
    <li><b>VO2max</b>: con un 4x4 por semana sigue mejorando, pero más lento. Si en el test de las semanas 6-8 no ves avance, vuelve al programa de 4 días.</li>
    <li><b>Tren superior</b>: las bajas están en pecho (no es prioridad) y un poco en espalda y tríceps. Glúteo, femoral y aductor quedan intactos.</li>
    <li><b>Si te falta tiempo</b>: en los días de pierna, la superserie final es lo primero que puedes saltarte.</li>
    <li>Todo lo demás se mantiene: progresión, peso según la pierna débil, descarga cada 6-8 semanas y la misma forma de medir.</li></ul>` },
  { t: 'Por qué se hace así', h: `
    <p><b>VO2max solo en tren superior</b>: el 4x4 en bici exige al corazón y a las piernas; junto a pierna suma fatiga sobre músculos que ya trabajan en tu turno de pie.</p>
    <p><b>Peso muerto, hip thrust y prensa antes que sentadilla</b>: cargan glúteo y femoral en extensión de cadera; la sentadilla tradicional carga más al cuádriceps.</p>
    <p><b>Hack squat profundo una vez por semana</b>: más flexión de cadera = más glúteo, sin que el cuádriceps reciba el volumen dominante.</p>
    <p><b>Trabajo unilateral</b>: evita que la pierna fuerte compense a la débil. Se empieza por la débil y la fuerte copia sus repeticiones.</p>
    <p><b>Superseries</b>: alternar músculos distintos u opuestos ahorra tiempo sin reducir el estímulo.</p>
    <p><b>Curl nórdico a pocas reps</b>: es excéntrico muy exigente; 12-15 llevaría a mala técnica y dolor excesivo.</p>
    <p><b>RPE 7-8 y no al fallo</b>: el fallo genera más fatiga y tu cuerpo ya acumula 8 horas de pie.</p>
    <p><b>3 meses con los mismos ejercicios</b>: el músculo necesita semanas para adaptarse y progresar en carga.</p>` },
  { t: 'Glosario', h: `<dl class="gloss">
    <dt>VO2max</dt><dd>Volumen máximo de oxígeno que tu cuerpo puede captar y usar en esfuerzo intenso (ml/kg/min).</dd>
    <dt>FCmax</dt><dd>Latidos por minuto más altos que tu corazón alcanza en esfuerzo máximo.</dd>
    <dt>Protocolo 4x4</dt><dd>4 intervalos de 4 min al 85-95% FCmax con 3 min de recuperación activa.</dd>
    <dt>Hipertrofia</dt><dd>Aumento del tamaño de las fibras musculares, principalmente con series de 6-15 repeticiones.</dd>
    <dt>RPE</dt><dd>Escala de esfuerzo 1-10. RPE 7-8 = 2-3 repeticiones en reserva.</dd>
    <dt>RM</dt><dd>Peso máximo para un número de repeticiones (ej. 5RM).</dd>
    <dt>Sobrecarga progresiva</dt><dd>Aumentar gradualmente peso, repeticiones, series o tiempo.</dd>
    <dt>Unilateral</dt><dd>Trabaja una pierna o un brazo a la vez.</dd>
    <dt>Excéntrico</dt><dd>Fase en que el músculo se alarga frenando la carga.</dd>
    <dt>Superserie</dt><dd>Dos ejercicios seguidos sin descanso; se descansa al terminar el par.</dd>
    <dt>Semana de descarga</dt><dd>Mitad de las series con el mismo peso para recuperar.</dd>
    <dt>Recuperación activa</dt><dd>Esfuerzo suave entre intervalos, sin detener el movimiento.</dd>
    <dt>DOMS</dt><dd>Dolor muscular de aparición tardía (24-72 h).</dd>
    <dt>Aductores</dt><dd>Músculos de la cara interna del muslo.</dd>
    <dt>Femoral</dt><dd>Parte posterior del muslo; flexiona la rodilla y extiende la cadera.</dd>
    <dt>Deltoide lateral</dt><dd>Porción del hombro que da ancho.</dd></dl>` },
];
